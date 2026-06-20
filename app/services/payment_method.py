"""Detección y normalización del medio de pago de un gasto.

Valores normalizados: credito | debito | qr | transferencia | efectivo | otro

Fuentes:
- Mercado Pago: campo `payment_type_id` (y `payment_method_id`).
- Gmail / texto libre: heurística por palabras clave.
"""
from __future__ import annotations

import re

VALID_METHODS = {"credito", "debito", "qr", "transferencia", "efectivo", "otro"}

METHOD_LABELS = {
    "credito": "Tarjeta de crédito",
    "debito": "Tarjeta de débito",
    "qr": "QR / billetera",
    "transferencia": "Transferencia",
    "efectivo": "Efectivo",
    "otro": "Otro",
}

# Mapa de payment_type_id de Mercado Pago → medio normalizado.
_MP_TYPE_MAP = {
    "credit_card": "credito",
    "debit_card": "debito",
    "prepaid_card": "debito",
    "bank_transfer": "transferencia",
    "money_transfer": "transferencia",
    "crypto_transfer": "transferencia",
    "account_money": "qr",
    "digital_wallet": "qr",
    "digital_currency": "qr",
    "ticket": "efectivo",
    "atm": "efectivo",
    "voucher_card": "efectivo",
}

_TEXT_PATTERNS = (
    ("credito", re.compile(r"tarjeta\s+de\s+cr[eé]dito|cr[eé]dito|credit\s*card", re.IGNORECASE)),
    ("debito", re.compile(r"tarjeta\s+de\s+d[eé]bito|d[eé]bito|debit\s*card", re.IGNORECASE)),
    ("qr", re.compile(r"\bqr\b|c[oó]digo\s+qr|billetera|saldo\s+en\s+cuenta", re.IGNORECASE)),
    ("transferencia", re.compile(r"transferencia|transfer(?:iste|encia)?|\bcvu\b|\bcbu\b", re.IGNORECASE)),
    ("efectivo", re.compile(r"efectivo|cash|pago\s*f[aá]cil|rapipago", re.IGNORECASE)),
)


def normalize_method(value: str | None) -> str:
    """Normaliza un valor arbitrario al conjunto válido; '' si no aplica."""
    v = (value or "").strip().lower()
    return v if v in VALID_METHODS else ""


def from_mp(payment_type_id: str | None, payment_method_id: str | None = None) -> str:
    """Mapea los campos de Mercado Pago al medio normalizado ('' si desconocido)."""
    key = (payment_type_id or "").strip().lower()
    if key in _MP_TYPE_MAP:
        return _MP_TYPE_MAP[key]
    # Algunos pagos exponen el instrumento sólo en payment_method_id.
    pm = (payment_method_id or "").strip().lower()
    if "transfer" in pm or pm in ("cvu", "cbu"):
        return "transferencia"
    if "debin" in pm:
        return "transferencia"
    if "account_money" in pm:
        return "qr"
    return ""


def from_text(text: str | None) -> str:
    """Detecta el medio de pago a partir de texto libre (email). '' si no hay señal."""
    if not text:
        return ""
    for method, pattern in _TEXT_PATTERNS:
        if pattern.search(text):
            return method
    return ""
