"""Auth: registro/login con sesiones + OAuth flows para Gmail y Mercado Pago."""
import secrets
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Connection, User
from ..security import (
    create_session, destroy_session, get_current_user,
    hash_password, verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ─── Registro / Login ────────────────────────────────────────────────────────

class RegisterPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
def register(payload: RegisterPayload, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Ya existe una cuenta con ese email")
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        onboarding_done=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    for provider in ("gmail", "mercadopago"):
        db.add(Connection(user_id=user.id, provider=provider))
    db.commit()
    create_session(db, user.id, response)
    return {"ok": True, "user": {"id": user.id, "name": user.name, "email": user.email}}


@router.post("/login")
def login(payload: LoginPayload, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Email o contraseña incorrectos")
    create_session(db, user.id, response)
    return {"ok": True, "user": {"id": user.id, "name": user.name, "email": user.email}}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    destroy_session(db, request, response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "onboarding_done": user.onboarding_done,
    }


# ─── Login social (Google / Mercado Pago) ───────────────────────────────────

@router.get("/providers")
def login_providers():
    """Qué métodos de login social están disponibles según la config."""
    settings = get_settings()
    return {
        "google": settings.gmail_enabled,
        "mercadopago": settings.mp_enabled,
        "bank": False,  # sin API pública de bancos en AR; ver docs/integraciones-bancarias.md
    }


def _login_state(response: Response) -> str:
    """Generate state and bind to session via cookie."""
    state = secrets.token_urlsafe(16)
    response.set_cookie(
        "oauth_state",
        state,
        max_age=600,
        httponly=True,
        secure=True,
        samesite="lax"
    )
    return state


def _check_login_state(request: Request, state: str) -> None:
    """Validate state is bound to this session (prevent Login CSRF)."""
    cookie_state = request.cookies.get("oauth_state")
    if not cookie_state or cookie_state != state:
        raise HTTPException(400, "Estado OAuth inválido")


def _find_or_create_user(db: Session, email: str, name: str) -> User:
    email = email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if user:
        return user
    user = User(name=name or email.split("@")[0], email=email, onboarding_done=False)
    db.add(user)
    db.commit()
    db.refresh(user)
    for provider in ("gmail", "mercadopago"):
        db.add(Connection(user_id=user.id, provider=provider))
    db.commit()
    return user


@router.get("/google/login")
def google_login():
    settings = get_settings()
    if not settings.gmail_enabled:
        raise HTTPException(400, "Login con Google no configurado. Agregá GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env")

    # Create response to set cookie
    response = Response(status_code=307)
    state = _login_state(response)

    redirect = f"{settings.app_url}/api/auth/google/login/callback"
    response.headers["Location"] = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.google_client_id}"
        f"&redirect_uri={redirect}"
        "&response_type=code"
        "&scope=openid%20email%20profile"
        f"&state={state}"
    )
    return response


@router.get("/google/login/callback")
async def google_login_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    _check_login_state(request, state)
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": f"{settings.app_url}/api/auth/google/login/callback",
            "grant_type": "authorization_code",
        })
        if r.status_code != 200:
            raise HTTPException(502, "Google no aceptó el código de autorización")
        access_token = r.json().get("access_token")
        info = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info.status_code != 200:
            raise HTTPException(502, "No se pudo leer el perfil de Google")
        profile = info.json()

    email = profile.get("email")
    if not email:
        raise HTTPException(400, "Google no devolvió un email")
    user = _find_or_create_user(db, email, profile.get("name", ""))
    response = RedirectResponse("/")
    create_session(db, user.id, response)
    return response


@router.get("/mp/login")
def mp_login():
    settings = get_settings()
    if not settings.mp_enabled:
        raise HTTPException(400, "Login con Mercado Pago no configurado. Agregá MP_CLIENT_ID y MP_CLIENT_SECRET en .env")

    # Create response to set cookie
    response = Response(status_code=307)
    state = _login_state(response)

    redirect = f"{settings.app_url}/api/auth/mp/login/callback"
    response.headers["Location"] = (
        "https://auth.mercadopago.com/authorization"
        f"?client_id={settings.mp_client_id}"
        f"&redirect_uri={redirect}"
        "&response_type=code"
        f"&state={state}"
    )
    return response


@router.get("/mp/login/callback")
async def mp_login_callback(request: Request, code: str, state: str, db: Session = Depends(get_db)):
    _check_login_state(request, state)
    import httpx
    settings = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post("https://api.mercadopago.com/oauth/token", data={
            "grant_type": "authorization_code",
            "client_id": settings.mp_client_id,
            "client_secret": settings.mp_client_secret,
            "code": code,
            "redirect_uri": f"{settings.app_url}/api/auth/mp/login/callback",
        })
        if r.status_code != 200:
            raise HTTPException(502, "Mercado Pago no aceptó el código de autorización")
        tokens = r.json()
        info = await client.get(
            "https://api.mercadopago.com/users/me",
            headers={"Authorization": f"Bearer {tokens.get('access_token')}"},
        )
        if info.status_code != 200:
            raise HTTPException(502, "No se pudo leer el perfil de Mercado Pago")
        profile = info.json()

    email = profile.get("email") or f"mp_{profile.get('id')}@mp.local"
    name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip()
    user = _find_or_create_user(db, email, name)

    # Ya que el usuario autorizó MP, dejamos la wallet conectada para sync
    _save_tokens(db, user.id, "mercadopago", tokens)

    response = RedirectResponse("/")
    create_session(db, user.id, response)
    return response


# ─── Estado OAuth: state → user_id ──────────────────────────────────────────
_oauth_states: dict[str, int] = {}


def _new_state(user_id: int) -> str:
    state = secrets.token_urlsafe(16)
    _oauth_states[state] = user_id
    return state


def _pop_state(state: str) -> int:
    if state not in _oauth_states:
        raise HTTPException(400, "Estado OAuth inválido")
    return _oauth_states.pop(state)


def _save_tokens(db: Session, user_id: int, provider: str, tokens: dict) -> None:
    conn = db.query(Connection).filter_by(user_id=user_id, provider=provider).first()
    if not conn:
        conn = Connection(user_id=user_id, provider=provider)
        db.add(conn)
    conn.status = "connected"
    conn.access_token = tokens.get("access_token")
    conn.refresh_token = tokens.get("refresh_token")
    conn.last_sync = datetime.utcnow()
    db.commit()


# ─── Gmail ──────────────────────────────────────────────────────────────────
@router.get("/gmail")
def gmail_connect(user: User = Depends(get_current_user)):
    settings = get_settings()
    if not settings.gmail_enabled:
        raise HTTPException(400, "Gmail OAuth no configurado. Agregá GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env")
    from ..services.gmail import get_oauth_url
    return RedirectResponse(get_oauth_url(_new_state(user.id)))


@router.get("/gmail/callback")
async def gmail_callback(code: str, state: str, db: Session = Depends(get_db)):
    user_id = _pop_state(state)
    from ..services.gmail import exchange_code
    tokens = await exchange_code(code)
    _save_tokens(db, user_id, "gmail", tokens)
    return RedirectResponse("/#connections?gmail=ok")


# ─── Mercado Pago ─────────────────────────────────────────────────────────
@router.get("/mp")
def mp_connect(user: User = Depends(get_current_user)):
    settings = get_settings()
    if not settings.mp_enabled:
        raise HTTPException(400, "Mercado Pago OAuth no configurado. Agregá MP_CLIENT_ID y MP_CLIENT_SECRET en .env")
    from ..services.mercadopago import get_oauth_url
    return RedirectResponse(get_oauth_url(_new_state(user.id)))


@router.get("/mp/callback")
async def mp_callback(code: str, state: str, db: Session = Depends(get_db)):
    user_id = _pop_state(state)
    from ..services.mercadopago import exchange_code
    tokens = await exchange_code(code)
    _save_tokens(db, user_id, "mercadopago", tokens)
    return RedirectResponse("/#connections?mp=ok")


# ─── Disconnect ──────────────────────────────────────────────────────────────
@router.post("/disconnect/{provider}")
def disconnect(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(user_id=user.id, provider=provider).first()
    if not conn:
        raise HTTPException(404, "Conexión no encontrada")
    conn.status = "disconnected"
    conn.access_token = None
    conn.refresh_token = None
    db.commit()
    return {"ok": True}
