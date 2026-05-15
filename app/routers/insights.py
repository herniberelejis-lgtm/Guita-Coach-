"""Insights — proyecciones, velocidad, resumen mensual."""
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Transaction

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/month")
def month_insights(db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=1).first()
    if not user or not user.monthly_income:
        return {"error": "Configurá tu ingreso primero"}

    now = date.today()
    month = now.strftime("%Y-%m")
    income = user.monthly_income

    days_in_month = (
        (date(now.year, now.month % 12 + 1, 1) - date(now.year, now.month, 1)).days
        if now.month < 12
        else (date(now.year + 1, 1, 1) - date(now.year, now.month, 1)).days
    )
    days_passed = now.day
    days_remaining = days_in_month - days_passed

    txs = db.query(Transaction).filter(
        Transaction.user_id == 1,
        Transaction.month == month,
        Transaction.status.in_(["confirmed", "classified"]),
    ).all()

    limits = {
        "necesidades": income * user.necesidades_pct / 100,
        "gustos": income * user.gustos_pct / 100,
        "ahorro": income * user.ahorro_pct / 100,
    }

    franjas = {}
    for cat, limit in limits.items():
        spent = sum(t.amount for t in txs if t.category == cat)
        daily_rate = spent / days_passed if days_passed > 0 else 0
        projection = spent + daily_rate * days_remaining

        top_merchants = {}
        for t in txs:
            if t.category == cat:
                top_merchants[t.merchant] = top_merchants.get(t.merchant, 0) + t.amount
        top = sorted(top_merchants.items(), key=lambda x: x[1], reverse=True)[:3]

        franjas[cat] = {
            "spent": spent,
            "limit": limit,
            "usage_pct": round(spent / limit * 100, 1) if limit > 0 else 0,
            "daily_rate": round(daily_rate, 0),
            "projected_total": round(projection, 0),
            "will_exceed": projection > limit,
            "top_merchants": [{"merchant": m, "amount": a} for m, a in top],
        }

    # Días hasta cobro
    payday = user.payday or 1
    if now.day <= payday:
        days_to_payday = payday - now.day
    else:
        next_month = date(now.year, now.month % 12 + 1, 1) if now.month < 12 else date(now.year + 1, 1, 1)
        payday_next = date(next_month.year, next_month.month, payday)
        days_to_payday = (payday_next - now).days

    total_spent = sum(t.amount for t in txs)
    total_budget = income

    return {
        "month": month,
        "income": income,
        "total_spent": total_spent,
        "total_budget": total_budget,
        "days_passed": days_passed,
        "days_remaining": days_remaining,
        "days_to_payday": days_to_payday,
        "franjas": franjas,
        "transaction_count": len(txs),
    }


@router.get("/summary")
def summary_stats(db: Session = Depends(get_db)):
    """Últimos 3 meses de stats para comparar."""
    user = db.query(User).filter_by(id=1).first()
    if not user or not user.monthly_income:
        return []

    now = date.today()
    months = []
    for i in range(3):
        m = now.month - i
        y = now.year
        if m <= 0:
            m += 12
            y -= 1
        months.append(f"{y}-{m:02d}")

    income = user.monthly_income
    result = []
    for month in months:
        txs = db.query(Transaction).filter(
            Transaction.user_id == 1,
            Transaction.month == month,
            Transaction.status.in_(["confirmed", "classified"]),
        ).all()
        if not txs:
            continue
        result.append({
            "month": month,
            "total": sum(t.amount for t in txs),
            "income": income,
            "by_category": {
                cat: sum(t.amount for t in txs if t.category == cat)
                for cat in ["necesidades", "gustos", "ahorro"]
            },
        })

    return result
