"""Auth: registro/login con sesiones + OAuth flows para Gmail y Mercado Pago."""
import secrets
from datetime import datetime
from urllib.parse import urlencode

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
    """Genera un state y lo ata al browser vía cookie (anti Login-CSRF).

    `secure` se deriva de APP_URL igual que la cookie de sesión: si se fuerza
    True en desarrollo sobre http, el browser descarta la cookie y el callback
    falla siempre con "Estado OAuth inválido".
    """
    state = secrets.token_urlsafe(16)
    response.set_cookie(
        "oauth_state",
        state,
        max_age=600,
        httponly=True,
        secure=get_settings().app_url.startswith("https://"),
        samesite="lax",
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

    response.headers["Location"] = (
        "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": settings.google_client_id,
            "redirect_uri": f"{settings.app_url}/api/auth/google/login/callback",
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
        })
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

    response.headers["Location"] = (
        "https://auth.mercadopago.com/authorization?" + urlencode({
            "client_id": settings.mp_client_id,
            "redirect_uri": f"{settings.app_url}/api/auth/mp/login/callback",
            "response_type": "code",
            "platform_id": "mp",  # requerido por Mercado Pago
            "state": state,
        })
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


# ─── Estado OAuth de los flujos de conexión ─────────────────────────────────
# Antes esto era un dict en memoria (state → user_id). No sobrevivía a los
# redeploys ni a correr más de una instancia: el usuario iba a Google, volvía,
# y el state ya no estaba → 400 "Estado OAuth inválido" en cada intento.
# Ahora el state va en cookie (igual que el login) y el usuario sale de la
# sesión, que es la fuente de verdad de quién está conectando.


def _redirect_with_state(url_builder, response: Response) -> Response:
    """Setea la cookie de state y redirige a la URL del proveedor."""
    state = _login_state(response)
    response.status_code = 307
    response.headers["Location"] = url_builder(state)
    return response


def _save_tokens(db: Session, user_id: int, provider: str, tokens: dict) -> None:
    from ..services.crypto import encrypt
    conn = db.query(Connection).filter_by(user_id=user_id, provider=provider).first()
    if not conn:
        conn = Connection(user_id=user_id, provider=provider)
        db.add(conn)
    conn.status = "connected"
    conn.access_token = encrypt(tokens.get("access_token"))
    conn.refresh_token = encrypt(tokens.get("refresh_token"))
    conn.last_sync = datetime.utcnow()
    db.commit()


# ─── Gmail ──────────────────────────────────────────────────────────────────
@router.get("/gmail")
def gmail_connect(response: Response, user: User = Depends(get_current_user)):
    settings = get_settings()
    if not settings.gmail_enabled:
        raise HTTPException(400, "Gmail OAuth no configurado. Agregá GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env")
    from ..services.gmail import get_oauth_url
    return _redirect_with_state(get_oauth_url, response)


@router.get("/gmail/callback")
async def gmail_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_login_state(request, state)
    from ..services.gmail import exchange_code
    tokens = await exchange_code(code)
    _save_tokens(db, user.id, "gmail", tokens)
    resp = RedirectResponse("/#settings?gmail=ok")
    resp.delete_cookie("oauth_state")
    return resp


# ─── Mercado Pago ─────────────────────────────────────────────────────────
@router.get("/mp")
def mp_connect(response: Response, user: User = Depends(get_current_user)):
    settings = get_settings()
    if not settings.mp_enabled:
        raise HTTPException(400, "Mercado Pago OAuth no configurado. Agregá MP_CLIENT_ID y MP_CLIENT_SECRET en .env")
    from ..services.mercadopago import get_oauth_url
    return _redirect_with_state(get_oauth_url, response)


@router.get("/mp/callback")
async def mp_callback(
    request: Request,
    code: str,
    state: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _check_login_state(request, state)
    from ..services.mercadopago import exchange_code
    tokens = await exchange_code(code)
    _save_tokens(db, user.id, "mercadopago", tokens)
    resp = RedirectResponse("/#settings?mp=ok")
    resp.delete_cookie("oauth_state")
    return resp


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
