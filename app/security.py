"""Seguridad: hash de contraseñas (PBKDF2, stdlib) y sesiones por cookie."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User, UserSession

PBKDF2_ITERATIONS = 200_000
SESSION_COOKIE = "gc_session"
SESSION_DAYS = 30


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, iters, salt, digest = stored.split("$")
        computed = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), int(iters)
        ).hex()
        return hmac.compare_digest(computed, digest)
    except (ValueError, AttributeError):
        return False


def create_session(db: Session, user_id: int, response: Response) -> str:
    token = secrets.token_urlsafe(32)
    db.add(UserSession(
        user_id=user_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(days=SESSION_DAYS),
    ))
    db.commit()
    secure = get_settings().app_url.startswith("https://")
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_DAYS * 86400,
        httponly=True, samesite="lax", secure=secure,
    )
    return token


def destroy_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.query(UserSession).filter_by(token=token).delete()
        db.commit()
    response.delete_cookie(SESSION_COOKIE)


def _session_user(db: Session, request: Request) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    sess = db.query(UserSession).filter_by(token=token).first()
    if not sess or (sess.expires_at and sess.expires_at < datetime.utcnow()):
        return None
    return db.query(User).filter_by(id=sess.user_id).first()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Usuario autenticado. En demo mode, cae al usuario 1 si no hay sesión."""
    user = _session_user(db, request)
    if user:
        return user
    if get_settings().demo_mode:
        user = db.query(User).filter_by(id=1).first()
        if user:
            return user
    raise HTTPException(401, "No autenticado")


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None
