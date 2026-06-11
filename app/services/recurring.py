"""Materializa gastos fijos y cuotas como transacciones del mes.

Idempotente: cada RecurringExpense recuerda el último mes aplicado
(`last_applied_month`), así puede correrse en cada carga del dashboard
sin duplicar nada.
"""
from datetime import date

from sqlalchemy.orm import Session

from ..models import RecurringExpense, Transaction


def apply_recurring(db: Session, user_id: int, today: date | None = None) -> int:
    """Aplica los gastos fijos pendientes del mes actual. Devuelve cuántos creó."""
    today = today or date.today()
    month = today.strftime("%Y-%m")
    created = 0

    items = db.query(RecurringExpense).filter_by(user_id=user_id, active=True).all()
    for item in items:
        if item.last_applied_month == month:
            continue
        if today.day < min(item.day_of_month, 28):
            continue  # todavía no llegó el día de débito de este mes

        if item.installments_total > 0 and item.installments_paid >= item.installments_total:
            item.active = False
            continue

        day = min(item.day_of_month, 28)
        merchant = item.merchant
        if item.installments_total > 0:
            merchant = f"{item.merchant} (cuota {item.installments_paid + 1}/{item.installments_total})"

        db.add(Transaction(
            user_id=user_id,
            source="recurring",
            provider="Gasto fijo",
            merchant=merchant,
            amount=item.amount,
            date=f"{month}-{day:02d}",
            month=month,
            category=item.category,
            tx_type="expense",
            status="confirmed",
            confidence=1.0,
            rule_used="recurring",
        ))
        item.last_applied_month = month
        if item.installments_total > 0:
            item.installments_paid += 1
            if item.installments_paid >= item.installments_total:
                item.active = False
        created += 1

    if created:
        db.commit()
    return created


def monthly_committed(db: Session, user_id: int) -> float:
    """Total mensual comprometido en gastos fijos y cuotas activas."""
    items = db.query(RecurringExpense).filter_by(user_id=user_id, active=True).all()
    return sum(i.amount for i in items)
