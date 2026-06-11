"""Advisor router: pattern analysis and spending advice."""
from collections import Counter
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, User
from ..security import get_current_user

router = APIRouter(prefix="/api/advisor", tags=["advisor"])


def _get_patterns(db: Session, user_id: int, month: str) -> dict:
    txs = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.month == month,
        Transaction.tx_type == "expense",
        Transaction.is_internal_transfer == False,
        Transaction.is_duplicate == False,
    ).all()

    by_freq = Counter(t.merchant for t in txs if t.merchant)
    by_amount: dict = {}
    for t in txs:
        if t.merchant:
            by_amount[t.merchant] = by_amount.get(t.merchant, 0) + t.amount

    top_freq = [
        {"merchant": m, "count": c, "total": by_amount.get(m, 0)}
        for m, c in by_freq.most_common(5)
    ]
    top_amount = [
        {"merchant": m, "total": a, "count": by_freq.get(m, 0)}
        for m, a in sorted(by_amount.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    by_cat: dict = {}
    for t in txs:
        by_cat[t.category] = by_cat.get(t.category, 0) + t.amount

    return {
        "top_by_frequency": top_freq,
        "top_by_amount": top_amount,
        "by_category": by_cat,
    }


@router.get("/patterns")
async def get_patterns(month: str = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from datetime import date
    if not month:
        month = date.today().strftime("%Y-%m")
    return _get_patterns(db, user_id=user.id, month=month)


@router.post("/advice")
async def get_advice(body: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from datetime import date
    month = body.get("month") or date.today().strftime("%Y-%m")
    focus = body.get("focus", "gustos")

    patterns = _get_patterns(db, user_id=user.id, month=month)
    income = user.monthly_income or 0

    from ..services import ai_provider
    advice = await ai_provider.get_advice(patterns, focus, income)
    if not advice:
        advice = _rule_based_advice(patterns, focus, income)

    return {"advice": advice, "month": month, "focus": focus}


def _rule_based_advice(patterns: dict, focus: str, income: float) -> str:
    top = patterns["top_by_frequency"]
    if not top:
        return f"No tenes gastos registrados en {focus} este mes."
    merchant = top[0]["merchant"]
    count = top[0]["count"]
    total = top[0]["total"]
    spent_cat = patterns["by_category"].get(focus, 0)
    limit = income * {"necesidades": 0.5, "gustos": 0.3, "ahorro": 0.2}.get(focus, 0.3)
    pct = int(spent_cat / limit * 100) if limit > 0 else 0
    return (
        f"Tu gasto mas frecuente en {focus} es {merchant} ({count} veces, "
        f"${total:,.0f} en total). Estas al {pct}% del limite de {focus}."
    )


