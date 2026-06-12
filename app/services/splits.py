"""Detección de gastos compartidos (vaquitas) y neteo de devoluciones.

Patrón: el usuario paga un monto grande y en los días siguientes recibe
varias transferencias menores — típico "yo pongo y después me devuelven".
La app NUNCA netea sola: crea una alerta que pregunta, y solo al confirmar
las entradas se marcan como devoluciones (is_reimbursement) vinculadas al
gasto (reimburses_tx_id).

Efecto contable al confirmar:
- Las devoluciones dejan de contar como ingreso.
- El gasto se computa neto: amount - devoluciones vinculadas.
"""
import json
from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import Alert, Transaction

MIN_EXPENSE = 15_000      # solo gastos "grandes" disparan la pregunta
WINDOW_DAYS = 7           # ventana de días posteriores al pago
MIN_INCOMES = 2           # cantidad mínima de transferencias entrantes
MIN_RATIO = 0.20          # las devoluciones deben cubrir al menos 20% del gasto


def _clean(txs):
    return [t for t in txs if not t.is_internal_transfer and not t.is_duplicate]


def detect_split_candidates(db: Session, user_id: int, lookback_days: int = 60) -> int:
    """Busca patrones de gasto compartido y crea alertas-pregunta. Idempotente."""
    since = (date.today() - timedelta(days=lookback_days)).isoformat()
    txs = _clean(db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.date >= since,
    ).all())

    expenses = [t for t in txs if t.tx_type == "expense" and t.amount >= MIN_EXPENSE]
    incomes = [t for t in txs if t.tx_type == "income" and not t.is_reimbursement]

    # No volver a preguntar por gastos que ya tienen alerta (leída o no)
    asked: set[int] = set()
    for a in db.query(Alert).filter_by(user_id=user_id, type="split_suggestion").all():
        try:
            asked.add(json.loads(a.payload or "{}").get("expense_id"))
        except (ValueError, TypeError):
            continue

    created = 0
    for exp in expenses:
        if exp.id in asked:
            continue
        try:
            d0 = date.fromisoformat(exp.date)
        except (ValueError, TypeError):
            continue
        d1 = (d0 + timedelta(days=WINDOW_DAYS)).isoformat()

        candidates = [
            i for i in incomes
            if exp.date <= i.date <= d1 and i.amount < exp.amount
        ]
        if len(candidates) < MIN_INCOMES:
            continue
        # Quedarse con las que sumadas no superan el gasto (de mayor a menor)
        picked, total = [], 0.0
        for i in sorted(candidates, key=lambda x: x.amount, reverse=True):
            if total + i.amount <= exp.amount * 1.02:
                picked.append(i)
                total += i.amount
        if len(picked) < MIN_INCOMES or total < exp.amount * MIN_RATIO:
            continue

        db.add(Alert(
            user_id=user_id,
            type="split_suggestion",
            category=exp.category or "",
            severity="warning",
            message=(
                f"Pagaste ${exp.amount:,.0f} en {exp.merchant or 'un comercio'} el {exp.date} "
                f"y en los {WINDOW_DAYS} días siguientes te entraron {len(picked)} transferencias "
                f"por ${total:,.0f}. ¿Fue un gasto compartido que te devolvieron?"
            ),
            ai_advice="Si confirmás, esas entradas se descuentan del gasto y no cuentan como ingreso.",
            payload=json.dumps({
                "expense_id": exp.id,
                "income_ids": [i.id for i in picked],
                "reimbursed_total": total,
            }),
        ))
        created += 1

    if created:
        db.commit()
    return created


def confirm_split(db: Session, user_id: int, expense_id: int, income_ids: list[int]) -> dict:
    """Marca las entradas como devoluciones del gasto. Devuelve el neteo."""
    exp = db.query(Transaction).filter_by(
        id=expense_id, user_id=user_id, tx_type="expense").first()
    if not exp:
        raise ValueError("Gasto no encontrado")

    linked = 0
    total = 0.0
    for iid in income_ids:
        inc = db.query(Transaction).filter_by(
            id=iid, user_id=user_id, tx_type="income").first()
        if inc and not inc.is_reimbursement:
            inc.is_reimbursement = True
            inc.reimburses_tx_id = exp.id
            linked += 1
            total += inc.amount
    db.commit()
    return {"linked": linked, "reimbursed_total": total,
            "net_expense": max(exp.amount - total, 0)}


def reimbursement_map(db: Session, user_id: int) -> dict[int, float]:
    """expense_id -> total devuelto. Para netear gastos en los totales."""
    rows = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_reimbursement == True,
        Transaction.reimburses_tx_id != None,
    ).all()
    out: dict[int, float] = {}
    for r in rows:
        out[r.reimburses_tx_id] = out.get(r.reimburses_tx_id, 0.0) + r.amount
    return out


def expense_amount(t: Transaction, reimb: dict[int, float]) -> float:
    """Monto efectivo de un gasto neteando devoluciones confirmadas."""
    return max(t.amount - reimb.get(t.id, 0.0), 0.0)
