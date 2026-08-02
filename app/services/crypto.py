"""Cifrado en reposo para tokens OAuth (Connection.access_token / refresh_token).

Deriva una clave Fernet de SECRET_KEY. Si SECRET_KEY cambia, los tokens ya
guardados dejan de poder desencriptarse — hay que reconectar esas cuentas.

decrypt() hace fallback a texto plano si el valor no es un token Fernet válido,
para no romper conexiones guardadas antes de este cambio.
"""
import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken


@lru_cache()
def _fernet() -> Fernet:
    from ..config import get_settings
    key = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value: str | None) -> str | None:
    if not value:
        return value
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return value
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        # Valor guardado antes de que existiera este cifrado: era texto plano.
        return value
