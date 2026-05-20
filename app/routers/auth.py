"""Auth + OAuth flows para Gmail y Mercado Pago."""
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Connection, Transaction
from ..config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ─── Estado OAuth (simple, sin Redis) ───────────────────────────────────────
_oauth_states: set[str] = set()

# ─── Gmail ──────────────────────────────────────────────────────────────────
@router.get("/gmail")
def gmail_connect():
    settings = get_settings()
    if not settings.gmail_enabled:
        raise HTTPException(400, "Gmail OAuth no configurado. Agregá GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env")
    state = secrets.token_urlsafe(16)
    _oauth_states.add(state)
    from ..services.gmail import get_oauth_url
    return RedirectResponse(get_oauth_url(state))

@router.get("/gmail/callback")
async def gmail_callback(code: str, state: str, db: Session = Depends(get_db)):
    if state not in _oauth_states:
        raise HTTPException(400, "Estado OAuth inválido")
    _oauth_states.discard(state)

    from ..services.gmail import exchange_code
    tokens = await exchange_code(code)

    conn = db.query(Connection).filter_by(provider="gmail").first()
    if not conn:
        conn = Connection(user_id=1, provider="gmail")
        db.add(conn)
    conn.status = "connected"
    conn.access_token = tokens.get("access_token")
    conn.refresh_token = tokens.get("refresh_token")
    conn.last_sync = datetime.utcnow()
    db.commit()

    return RedirectResponse("/#connections?gmail=ok")

# ─── Mercado Pago ─────────────────────────────────────────────────────────
@router.get("/mp")
def mp_connect():
    settings = get_settings()
    if not settings.mp_enabled:
        raise HTTPException(400, "Mercado Pago OAuth no configurado. Agregá MP_CLIENT_ID y MP_CLIENT_SECRET en .env")
    state = secrets.token_urlsafe(16)
    _oauth_states.add(state)
    from ..services.mercadopago import get_oauth_url
    return RedirectResponse(get_oauth_url(state))

@router.get("/mp/callback")
async def mp_callback(code: str, state: str, db: Session = Depends(get_db)):
    if state not in _oauth_states:
        raise HTTPException(400, "Estado OAuth inválido")
    _oauth_states.discard(state)

    from ..services.mercadopago import exchange_code
    tokens = await exchange_code(code)

    conn = db.query(Connection).filter_by(provider="mercadopago").first()
    if not conn:
        conn = Connection(user_id=1, provider="mercadopago")
        db.add(conn)
    conn.status = "connected"
    conn.access_token = tokens.get("access_token")
    conn.refresh_token = tokens.get("refresh_token")
    conn.last_sync = datetime.utcnow()
    db.commit()

    return RedirectResponse("/#connections?mp=ok")

# ─── Disconnect ──────────────────────────────────────────────────────────────
@router.post("/disconnect/{provider}")
def disconnect(provider: str, db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(provider=provider).first()
    if not conn:
        raise HTTPException(404, "Conexión no encontrada")
    conn.status = "disconnected"
    conn.access_token = None
    conn.refresh_token = None
    db.commit()
    return {"ok": True}
