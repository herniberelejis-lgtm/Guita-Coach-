"""Budget endpoints — franjas, onboarding, history."""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Transaction, Alert
from ..security import get_current_user
from ..services.splits import expense_amount, reimbursement_map

router = APIRouter(prefix="/api/budget", tags=["budget"])


class OnboardingPayload(BaseModel):
    name: str
    monthly_income: float
    necesidades_pct: int = 50
    gustos_pct: int = 30
    ahorro_pct: int = 20
    payday: int = 1
    income_is_variable: bool = False


class BudgetUpdatePayload(BaseModel):
    monthly_income: Optional[float] = None
    necesidades_pct: Optional[int] = None
    gustos_pct: Optional[int] = None
    ahorro_pct: Optional[int] = None
    payday: Optional[int] = None
    income_is_variable: Optional[bool] = None


def _franja_data(user: User, txs: list, month: str, days_remaining: int = 1,
                 reimb: dict | None = None, income_base: float | None = None) -> dict:
    income = income_base if income_base is not None else (user.monthly_income or 0)
    limits = {
        "necesidades": income * user.necesidades_pct / 100,
        "gustos": income * user.gustos_pct / 100,
        "ahorro": income * user.ahorro_pct / 100,
    }
    reimb = reimb or {}
    visible = [t for t in txs if not getattr(t, 'is_internal_transfer', False) and not getattr(t, 'is_duplicate', False)]
    spent = {
        cat: sum(expense_amount(t, reimb) for t in visible if t.category == cat and getattr(t, 'tx_type', 'expense') == 'expense')
        for cat in limits
    }
    dr = max(days_remaining, 1)
    return {
        "month": month,
        "income": income,
        "franjas": [
            {
                "name": cat,
                "label": {"necesidades": "Necesidades", "gustos": "Gustos", "ahorro": "Ahorro"}[cat],
                "pct_config": getattr(user, f"{cat}_pct"),
                "limit": limits[cat],
                "spent": spent[cat],
                "remaining": max(0, limits[cat] - spent[cat]),
                "usage_pct": round(spent[cat] / limits[cat] * 100, 1) if limits[cat] > 0 else 0,
                "daily_allowance": round(max(0, limits[cat] - spent[cat]) / dr, 0),
            }
            for cat in ["necesidades", "gustos", "ahorro"]
        ],
    }


@router.get("/current")
def get_current_budget(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from ..services.recurring import apply_recurring
    apply_recurring(db, user.id)
    month = date.today().strftime("%Y-%m")
    txs = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.month == month,
        Transaction.status.in_(["confirmed", "classified"])
    ).all()

    now = date.today()
    days_in_month = (date(now.year, now.month % 12 + 1, 1) - date(now.year, now.month, 1)).days \
        if now.month < 12 else (date(now.year + 1, 1, 1) - date(now.year, now.month, 1)).days
    days_passed = now.day

    days_remaining = max(days_in_month - days_passed, 1)
    reimb = reimbursement_map(db, user.id)

    visible_txs = [t for t in txs if not getattr(t, 'is_internal_transfer', False) and not getattr(t, 'is_duplicate', False)]
    tracked_income = sum(t.amount for t in visible_txs
                         if getattr(t, 'tx_type', 'expense') == 'income'
                         and not getattr(t, 'is_reimbursement', False))
    total_expenses = sum(expense_amount(t, reimb) for t in visible_txs
                         if getattr(t, 'tx_type', 'expense') == 'expense')

    is_variable = bool(getattr(user, 'income_is_variable', False))
    declared_income = user.monthly_income or 0

    # Base del presupuesto:
    #  - Ingreso fijo: el sueldo declarado es el piso; si lo registrado lo supera, gana lo real.
    #  - Ingreso variable: no hay sueldo fijo, así que la base son los ingresos
    #    realmente registrados este mes (MP/Gmail/manual).
    if is_variable:
        total_income = tracked_income
        income_base = tracked_income
    else:
        total_income = max(tracked_income, declared_income)
        income_base = total_income

    data = _franja_data(user, txs, month, days_remaining=days_remaining, reimb=reimb, income_base=income_base)
    data["days_passed"] = days_passed
    data["days_in_month"] = days_in_month
    data["days_remaining"] = days_in_month - days_passed

    balance = total_income - total_expenses
    pending_count = sum(1 for t in txs if t.needs_review and t.status != "reviewed")

    data["total_income"] = total_income
    data["tracked_income"] = tracked_income
    data["declared_income"] = declared_income
    data["income_is_variable"] = is_variable
    data["income_is_declared"] = (not is_variable) and declared_income > tracked_income
    data["total_expenses"] = total_expenses
    data["balance"] = balance
    data["pending_count"] = pending_count
    data["onboarding_done"] = user.onboarding_done
    data["name"] = user.name
    data["payday"] = user.payday

    alerts = db.query(Alert).filter(
        Alert.user_id == user.id,
        Alert.is_read == False
    ).order_by(Alert.created_at.desc()).all()

    data["alerts"] = [
        {
            "id": a.id,
            "type": a.type,
            "category": a.category,
            "message": a.message,
            "ai_advice": a.ai_advice,
            "severity": a.severity,
            "payload": a.payload,
            "created_at": a.created_at.isoformat(),
        }
        for a in alerts
    ]

    return data


@router.post("/onboarding")
def complete_onboarding(payload: OnboardingPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.necesidades_pct + payload.gustos_pct + payload.ahorro_pct != 100:
        raise HTTPException(400, "Los porcentajes deben sumar 100")

    user.name = payload.name
    user.monthly_income = payload.monthly_income
    user.necesidades_pct = payload.necesidades_pct
    user.gustos_pct = payload.gustos_pct
    user.ahorro_pct = payload.ahorro_pct
    user.payday = payload.payday
    user.income_is_variable = payload.income_is_variable
    user.onboarding_done = True
    db.commit()
    return {"ok": True}


@router.patch("/settings")
def update_budget_settings(payload: BudgetUpdatePayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.monthly_income is not None:
        user.monthly_income = payload.monthly_income
    if payload.necesidades_pct is not None:
        user.necesidades_pct = payload.necesidades_pct
    if payload.gustos_pct is not None:
        user.gustos_pct = payload.gustos_pct
    if payload.ahorro_pct is not None:
        user.ahorro_pct = payload.ahorro_pct
    if payload.payday is not None:
        user.payday = payload.payday
    if payload.income_is_variable is not None:
        user.income_is_variable = payload.income_is_variable

    total = user.necesidades_pct + user.gustos_pct + user.ahorro_pct
    if total != 100:
        db.rollback()
        raise HTTPException(400, f"Los porcentajes suman {total}, deben ser 100")

    db.commit()
    return {"ok": True}


@router.post("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    alert = db.query(Alert).filter_by(id=alert_id, user_id=user.id).first()
    if not alert:
        raise HTTPException(404, "Alerta no encontrada")
    alert.is_read = True
    db.commit()
    return {"ok": True}


@router.get("/history")
def get_budget_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    months_raw = db.query(Transaction.month).filter(
        Transaction.user_id == user.id,
        Transaction.status.in_(["confirmed", "classified"])
    ).distinct().all()

    months = sorted([m[0] for m in months_raw], reverse=True)[:6]
    result = []
    for month in months:
        txs = db.query(Transaction).filter(
            Transaction.user_id == user.id,
            Transaction.month == month,
            Transaction.status.in_(["confirmed", "classified"])
        ).all()
        result.append(_franja_data(user, txs, month, reimb=reimbursement_map(db, user.id)))

    return result
