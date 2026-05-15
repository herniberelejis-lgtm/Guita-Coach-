"""Motor de alertas. Corre después de cada transacción nueva."""
from datetime import datetime, date
from sqlalchemy.orm import Session
from ..models import Transaction, Alert, User

def _capitalize(s: str) -> str:
    return s.capitalize()

async def run_alert_engine(user_id: int, db: Session):
    now = date.today()
    month = now.strftime("%Y-%m")
    days_in_month = (date(now.year, now.month % 12 + 1, 1) - date(now.year, now.month, 1)).days if now.month < 12 \
        else (date(now.year + 1, 1, 1) - date(now.year, now.month, 1)).days
    days_passed = now.day
    days_remaining = days_in_month - days_passed

    user = db.query(User).filter_by(id=user_id).first()
    if not user or not user.monthly_income:
        return

    income = user.monthly_income
    limits = {
        "necesidades": income * user.necesidades_pct / 100,
        "gustos": income * user.gustos_pct / 100,
        "ahorro": income * user.ahorro_pct / 100,
    }

    txs = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.month == month
    ).all()

    spent = {}
    for cat in limits:
        spent[cat] = sum(t.amount for t in txs if t.category == cat)

    one_day_ago = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    for cat, limit in limits.items():
        s = spent.get(cat, 0)
        pct = s / limit if limit > 0 else 0

        # Threshold 90%
        if pct >= 0.9:
            if not _alert_exists(db, user_id, "threshold", cat, one_day_ago):
                remaining = limit - s
                msg = f"{_capitalize(cat)} casi en el límite. Te quedan ${remaining:,.0f} para {days_remaining} días."
                ai_msg = await _get_ai_advice(cat, s, limit, txs, db) if _claude_available() else None
                db.add(Alert(user_id=user_id, type="threshold", category=cat,
                             message=msg, ai_advice=ai_msg, severity="critical"))

        elif pct >= 0.75:
            if not _alert_exists(db, user_id, "threshold", cat, one_day_ago):
                msg = f"Ojo, venís rápido con {cat}. Estás al {int(pct*100)}% y quedan {days_remaining} días."
                ai_msg = await _get_ai_advice(cat, s, limit, txs, db) if _claude_available() else None
                db.add(Alert(user_id=user_id, type="threshold", category=cat,
                             message=msg, ai_advice=ai_msg, severity="warning"))

        # Proyección
        elif pct < 0.75 and days_passed > 0:
            daily_rate = s / days_passed
            projection = s + daily_rate * days_remaining
            if projection > limit and not _alert_exists(db, user_id, "projection", cat, one_day_ago):
                msg = f"Si seguís así, {cat} va a pasar el límite antes de fin de mes."
                db.add(Alert(user_id=user_id, type="projection", category=cat,
                             message=msg, severity="warning"))

    db.commit()

def _alert_exists(db: Session, user_id: int, type_: str, category: str, since) -> bool:
    return db.query(Alert).filter(
        Alert.user_id == user_id,
        Alert.type == type_,
        Alert.category == category,
        Alert.is_read == False,
        Alert.created_at >= since
    ).first() is not None

def _claude_available() -> bool:
    from ..config import get_settings
    return get_settings().claude_enabled

async def _get_ai_advice(category: str, spent: float, limit: float, txs: list, db: Session) -> str:
    from ..config import get_settings
    settings = get_settings()
    if not settings.claude_enabled:
        return ""

    import anthropic
    cat_txs = [(t.merchant, t.amount) for t in txs if t.category == category]
    top = sorted(cat_txs, key=lambda x: x[1], reverse=True)[:5]
    top_str = "\n".join(f"- {m}: ${a:,.0f}" for m, a in top)

    prompt = f"""Sos un coach financiero argentino, cercano y directo.

El usuario lleva ${spent:,.0f} gastados en {category} de un límite de ${limit:,.0f}.
Sus últimos gastos en esta franja:
{top_str}

Escribí UN consejo concreto y específico (máximo 2 orsentences, tono informal rioplatense).
No des consejos genéricos. Hacé referencia a los gastos reales.
No uses emojis. No uses "hola". Arrancá directo al punto."""

    try:
        import anthropic as ant
        client = ant.Anthropic(api_key=settings.claude_api_key)
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception:
        return ""
