"""Importador del CSV/Excel de actividad de Mercado Pago.

La API pública de MP no expone las compras con tarjeta prepaga/débito,
pero el "estado de cuenta" descargable desde la app las incluye todas.
Este parser es tolerante: detecta delimitador, busca la fila de cabecera
por palabras clave y soporta formato de monto argentino (1.234,56).
"""
import csv
import hashlib
import io
import re
from typing import Optional

HEADER_HINTS = {
    "date": ("fecha", "date", "día"),
    "description": ("descripci", "concepto", "detalle", "operaci", "transaction_type", "tipo"),
    "amount": ("monto", "valor", "importe", "amount", "transaction_amount"),
    "id": ("id", "referencia", "nro", "número de operaci", "operation"),
}

_DATE_PATTERNS = (
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})"), lambda m: f"{m[1]}-{m[2]}-{m[3]}"),
    (re.compile(r"^(\d{2})/(\d{2})/(\d{4})"), lambda m: f"{m[3]}-{m[2]}-{m[1]}"),
    (re.compile(r"^(\d{2})-(\d{2})-(\d{4})"), lambda m: f"{m[3]}-{m[2]}-{m[1]}"),
)


def _parse_date(raw: str) -> Optional[str]:
    raw = (raw or "").strip()
    for pattern, build in _DATE_PATTERNS:
        m = pattern.match(raw)
        if m:
            return build(m)
    return None


def _parse_amount(raw: str) -> Optional[float]:
    """Soporta '-1.234,56', '$ 1234.56', '1,234.56'."""
    raw = (raw or "").strip().replace("$", "").replace(" ", "")
    if not raw:
        return None
    negative = raw.startswith("-") or (raw.startswith("(") and raw.endswith(")"))
    raw = raw.strip("()-+")
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")   # 1.234,56
        else:
            raw = raw.replace(",", "")                      # 1,234.56
    elif "," in raw:
        # coma como decimal si deja 1-2 dígitos al final
        head, _, tail = raw.rpartition(",")
        raw = f"{head.replace('.', '')}.{tail}" if len(tail) <= 2 else raw.replace(",", "")
    try:
        value = float(raw)
    except ValueError:
        return None
    return -value if negative else value


def _find_columns(header: list[str]) -> Optional[dict]:
    cols: dict = {}
    for idx, cell in enumerate(header):
        cell_l = (cell or "").lower().strip()
        for field, hints in HEADER_HINTS.items():
            if field not in cols and any(h in cell_l for h in hints):
                cols[field] = idx
    return cols if "date" in cols and "amount" in cols else None


def parse_mp_csv(content: bytes) -> list[dict]:
    """Convierte el CSV de actividad de MP en items para _save_transaction_item."""
    text = None
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if not text:
        raise ValueError("No se pudo leer el archivo: codificación desconocida")

    delimiter = ";" if text.count(";") > text.count(",") else ","
    rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))

    cols = None
    start = 0
    for i, row in enumerate(rows[:20]):
        cols = _find_columns(row)
        if cols:
            start = i + 1
            break
    if not cols:
        raise ValueError(
            "No encontré las columnas de fecha y monto. "
            "Asegurate de subir el reporte de actividad de Mercado Pago."
        )

    items = []
    for row in rows[start:]:
        if len(row) <= max(cols.values()):
            continue
        date = _parse_date(row[cols["date"]])
        amount = _parse_amount(row[cols["amount"]])
        if not date or amount is None or amount == 0:
            continue

        description = row[cols["description"]].strip() if "description" in cols else ""
        op_id = row[cols["id"]].strip() if "id" in cols else ""
        ref = f"mpcsv_{op_id}" if op_id else "mpcsv_" + hashlib.sha1(
            f"{date}|{amount}|{description}".encode()).hexdigest()[:16]

        items.append({
            "id": ref,
            "source": "mp_csv",
            "tx_type": "income" if amount > 0 else "expense",
            "amount": abs(amount),
            "currency": "ARS",
            "date": date,
            "month": date[:7],
            "merchant": description or "Movimiento MP",
            "provider": "MP (estado de cuenta)",
            "needs_review": not description,
            "raw_reference": ref,
        })
    return items
