"""Materializa gastos fijos y cuotas como transacciones del mes.

Idempotente: cada RecurringExpense recuerda el último mes aplicado
(`last_applied_month`), así puede correrse en cada carga del dashboard
sin duplicar nada.

`apply_recurring` corre en cada request a /api/budget/current — con el
dashboard disparando varios fetches por carga de página, dos requests
concurrentes pueden pasar el chequeo `last_applied_month == month` en
Python antes de que ninguna haga commit (TOCTOU). Por eso el "gano yo"
se resuelve con un UPDATE condicional atómico a nivel de base de datos
(la fila solo se actualiza si nadie más la tocó primero), no con una
lectura en Python seguida de una escritura.
"""
from datetime import date

from sqlalchemy import or_, update
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
            db.commit()
            continue

        # Snapshot ANTES del UPDATE: SQLAlchemy sincroniza el objeto ORM en
        # memoria apenas se ejecuta un update() con WHERE evaluable, no recién
        # al commitear — leer item.installments_paid después ya daría el
        # valor nuevo (bug detectado y corregido acá mismo).
        installments_paid_before = item.installments_paid

        # Gana la carrera quien logre este UPDATE primero: si otro request ya
        # marcó este item para el mes (o lo desactivó) entre nuestro SELECT y
        # este punto, rowcount da 0 y no se crea una transacción duplicada.
        result = db.execute(
            update(RecurringExpense)
            .where(
                RecurringExpense.id == item.id,
                # != no matchea NULL (lógica de 3 valores de SQL) — un item
                # recién creado tiene last_applied_month=None, así que hay
                # que admitirlo explícitamente además del caso "mes distinto".
                or_(
                    RecurringExpense.last_applied_month != month,
                    RecurringExpense.last_applied_month.is_(None),
                ),
                RecurringExpense.active == True,
            )
            .values(
                last_applied_month=month,
                installments_paid=RecurringExpense.installments_paid + (1 if item.installments_total > 0 else 0),
            )
        )
        if result.rowcount == 0:
            db.rollback()
            continue

        day = min(item.day_of_month, 28)
        merchant = item.merchant
        installments_paid_now = installments_paid_before + 1 if item.installments_total > 0 else 0
        if item.installments_total > 0:
            merchant = f"{item.merchant} (cuota {installments_paid_now}/{item.installments_total})"

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
        if item.installments_total > 0 and installments_paid_now >= item.installments_total:
            db.execute(
                update(RecurringExpense).where(RecurringExpense.id == item.id).values(active=False)
            )
        db.commit()
        created += 1

    return created


def monthly_committed(db: Session, user_id: int) -> float:
    """Total mensual comprometido en gastos fijos y cuotas activas."""
    items = db.query(RecurringExpense).filter_by(user_id=user_id, active=True).all()
    return sum(i.amount for i in items)
