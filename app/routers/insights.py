"""Insights — proyecciones, velocidad, resumen mensual."""
from collections import Counter
from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Transaction
from ..security import get_current_user

router = APIRouter(prefix="/api/insights", tags=["insights"])

# ─── Cotización dólar (cache 10 min) ────────────────────────────────────────
_dolar_cache: dict = {"at": None, "data": None}


@router.get("/dolar")
async def dolar():
    """Cotización blue/oficial desde dolarapi.com, cacheada 10 minutos."""
    import httpx
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    if _dolar_cache["at"] and now - _dolar_cache["at"] < timedelta(minutes=10):
        return _dolar_cache["data"]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get("https://dolarapi.com/v1/dolares")
            r.raise_for_status()
            rates = {d["casa"]: d for d in r.json()}
        data = {
            "blue": {"compra": rates.get("blue", {}).get("compra"),
                     "venta": rates.get("blue", {}).get("venta")},
            "oficial": {"compra": rates.get("oficial", {}).get("compra"),
                        "venta": rates.get("oficial", {}).get("venta")},
            "updated_at": now.isoformat(),
        }
        _dolar_cache.update(at=now, data=data)
        return data
    except Exception:
        if _dolar_cache["data"]:
            return _dolar_cache["data"]
        return {"blue": None, "oficial": None, "error": "Cotización no disponible"}



@router.get("/month")
def month_insights(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.monthly_income:
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
        Transaction.user_id == user.id,
        Transaction.month == month,
        Transaction.status.in_(["confirmed", "classified"]),
    ).all()

    expense_txs = [t for t in txs if getattr(t, 'tx_type', 'expense') == 'expense'
                   and not getattr(t, 'is_internal_transfer', False) and not getattr(t, 'is_duplicate', False)]

    limits = {
        "necesidades": income * user.necesidades_pct / 100,
        "gustos": income * user.gustos_pct / 100,
        "ahorro": income * user.ahorro_pct / 100,
    }

    dr = max(days_remaining, 1)
    franjas = {}
    for cat, limit in limits.items():
        spent = sum(t.amount for t in expense_txs if t.category == cat)
        remaining = max(0, limit - spent)
        daily_rate = spent / days_passed if days_passed > 0 else 0
        projection = spent + daily_rate * days_remaining

        top_merchants = {}
        for t in expense_txs:
            if t.category == cat:
                top_merchants[t.merchant] = top_merchants.get(t.merchant, 0) + t.amount
        top = sorted(top_merchants.items(), key=lambda x: x[1], reverse=True)[:3]

        franjas[cat] = {
            "spent": spent,
            "limit": limit,
            "remaining": remaining,
            "usage_pct": round(spent / limit * 100, 1) if limit > 0 else 0,
            "daily_rate": round(daily_rate, 0),
            "projected_total": round(projection, 0),
            "will_exceed": projection > limit,
            "top_merchants": [{"merchant": m, "amount": a} for m, a in top],
            "daily_allowance": round(remaining / dr, 0),
        }

    # Días hasta cobro
    payday = user.payday or 1
    if now.day <= payday:
        days_to_payday = payday - now.day
    else:
        next_month = date(now.year, now.month % 12 + 1, 1) if now.month < 12 else date(now.year + 1, 1, 1)
        payday_next = date(next_month.year, next_month.month, payday)
        days_to_payday = (payday_next - now).days

    total_spent = sum(t.amount for t in expense_txs)
    total_budget = income

    # Frequent merchants (top 5 by count, expense only) — one pass for totals
    merchant_counts = Counter()
    merchant_totals: dict = {}
    for t in expense_txs:
        if t.merchant:
            merchant_counts[t.merchant] += 1
            merchant_totals[t.merchant] = merchant_totals.get(t.merchant, 0) + t.amount
    frequent_merchants = [
        {"merchant": m, "count": c, "total": merchant_totals[m]}
        for m, c in merchant_counts.most_common(5)
    ]

    total_remaining = max(income - total_spent, 0)
    daily_allowance = round(total_remaining / dr, 0)

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
        "daily_allowance": daily_allowance,
        "frequent_merchants": frequent_merchants,
    }


@router.get("/summary")
def summary_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Últimos 3 meses de stats para comparar."""
    if not user.monthly_income:
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
            Transaction.user_id == user.id,
            Transaction.month == month,
            Transaction.tx_type == "expense",
            Transaction.status.in_(["confirmed", "classified"]),
        ).all()
        txs = [t for t in txs if not getattr(t, 'is_internal_transfer', False) and not getattr(t, 'is_duplicate', False)]
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
