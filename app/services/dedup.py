"""Detección de duplicados cross-source y transferencias entre cuentas propias.

Dos problemas que inflan los números:
1. La misma compra entra dos veces: cargada a mano + sincronizada por Gmail/MP.
2. Una transferencia entre cuentas del mismo usuario aparece como gasto en una
   fuente y como ingreso en otra; ninguna de las dos es plata que entró o salió.

Las transacciones marcadas (`is_duplicate`, `is_internal_transfer`) se conservan
en la DB para auditoría pero se excluyen de presupuesto, insights y chat.
"""
import re
import unicodedata
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Transaction

# Margen de fechas para considerar que dos registros son el mismo movimiento
DATE_WINDOW_DAYS = 1
# Palabras que sugieren transferencia propia en el merchant/descripcion
TRANSFER_KEYWORDS = (
    "transferencia", "transfer", "cuenta propia", "mis cuentas",
    "entre cuentas", "cvu", "cbu propio",
)


def _normalize(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]", "", text).strip()


def _dates_close(d1: str, d2: str, window: int = DATE_WINDOW_DAYS) -> bool:
    try:
        a = date.fromisoformat(d1)
        b = date.fromisoformat(d2)
    except (ValueError, TypeError):
        return d1 == d2
    return abs((a - b).days) <= window


def _merchants_match(m1: str, m2: str) -> bool:
    n1, n2 = _normalize(m1), _normalize(m2)
    if not n1 or not n2:
        return True  # sin merchant no podemos distinguir: el monto+fecha mandan
    return n1 in n2 or n2 in n1


def find_cross_source_duplicate(db: Session, user_id: int, item: dict) -> Transaction | None:
    """Busca una transacción existente de OTRA fuente que sea el mismo movimiento.

    Criterio: mismo monto exacto, fecha dentro de ±1 día, mismo tx_type y
    merchant compatible. Se usa al sincronizar para no contar dos veces lo que
    ya se cargó a mano (o vino por la otra fuente).
    """
    amount = item.get("amount")
    tx_date = item.get("date")
    source = item.get("source", "")
    tx_type = item.get("tx_type", "expense")
    if amount is None or not tx_date:
        return None

    try:
        d = date.fromisoformat(tx_date)
        lo = (d - timedelta(days=DATE_WINDOW_DAYS)).isoformat()
        hi = (d + timedelta(days=DATE_WINDOW_DAYS)).isoformat()
    except ValueError:
        lo = hi = tx_date

    candidates = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.amount == amount,
        Transaction.tx_type == tx_type,
        Transaction.source != source,
        Transaction.date >= lo,
        Transaction.date <= hi,
        Transaction.is_duplicate == False,
    ).all()

    merchant = item.get("merchant", "")
    for c in candidates:
        if _merchants_match(merchant, c.merchant or ""):
            return c
    return None


def _looks_like_transfer(tx: Transaction) -> bool:
    text = _normalize(f"{tx.merchant or ''} {tx.provider or ''}")
    return any(_normalize(k) in text for k in TRANSFER_KEYWORDS)


def mark_duplicates_and_transfers(db: Session, user_id: int, month: str | None = None) -> dict:
    """Recorre las transacciones (de un mes o todas) y marca:

    - Transferencias internas: par income/expense con mismo monto y fecha
      dentro de ±1 día, donde al menos uno de los dos parece transferencia
      (keyword) o vienen de fuentes distintas con merchant compatible.
    - Devuelve conteos para informar al usuario.
    """
    q = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_duplicate == False,
        Transaction.is_internal_transfer == False,
    )
    if month:
        q = q.filter(Transaction.month == month)
    txs = q.all()

    expenses = [t for t in txs if t.tx_type == "expense"]
    incomes = [t for t in txs if t.tx_type == "income"]

    transfers = 0
    used_income_ids: set[int] = set()
    for e in expenses:
        for i in incomes:
            if i.id in used_income_ids:
                continue
            if e.amount != i.amount or not _dates_close(e.date, i.date):
                continue
            # Señales: keyword de transferencia en cualquiera de los dos,
            # o mismo movimiento visto desde dos fuentes distintas.
            if _looks_like_transfer(e) or _looks_like_transfer(i) or (
                e.source != i.source and _merchants_match(e.merchant or "", i.merchant or "")
            ):
                e.is_internal_transfer = True
                i.is_internal_transfer = True
                used_income_ids.add(i.id)
                transfers += 1
                break

    if transfers:
        db.commit()
    return {"internal_transfers": transfers}
