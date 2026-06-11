"""Chat router: AI financial advisor with Argentine investment priority framework."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, User
from ..security import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


STARTERS = [
    "Cuanto me sobra a fin de mes para ahorrar o invertir?",
    "Tengo deudas, por donde empiezo?",
    "Ya tengo fondo de emergencia, en que invierto?",
    "Cuanto necesito para armar mi fondo de emergencia?",
    "Como diversifico mis ahorros en Argentina?",
]


def _month_list(n: int = 6) -> list[str]:
    from datetime import date
    today = date.today()
    months, y, m = [], today.year, today.month
    for _ in range(n):
        months.append(f"{y}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return months


def _load_financial_context(db: Session, user: User) -> dict:
    from datetime import date
    month = date.today().strftime("%Y-%m")
    months = _month_list(6)

    all_txs = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.month.in_(months),
        Transaction.is_internal_transfer == False,
        Transaction.is_duplicate == False,
    ).all()
    txs = [t for t in all_txs if t.month == month]

    income = sum(t.amount for t in txs if t.tx_type == "income")
    expenses = sum(t.amount for t in txs if t.tx_type == "expense")
    savings_accumulated = sum(t.amount for t in txs if t.category == "ahorro")

    # Historial mensual de 6 meses
    history = []
    for m in reversed(months):
        m_inc = sum(t.amount for t in all_txs if t.month == m and t.tx_type == "income")
        m_exp = sum(t.amount for t in all_txs if t.month == m and t.tx_type == "expense")
        if m_inc or m_exp:
            history.append((m, m_inc, m_exp))

    # Top comercios por gasto
    def _top(items, n):
        totals: dict = {}
        for t in items:
            if t.tx_type == "expense" and t.merchant:
                totals[t.merchant] = totals.get(t.merchant, 0) + t.amount
        return sorted(totals.items(), key=lambda x: x[1], reverse=True)[:n]

    # Desglose por subcategoría del mes
    by_subcat: dict = {}
    for t in txs:
        if t.tx_type == "expense":
            key = t.subcategory or t.category or "sin categoría"
            by_subcat[key] = by_subcat.get(key, 0) + t.amount

    from ..models import Goal, RecurringExpense
    goals = db.query(Goal).filter_by(user_id=user.id, parent_id=None).all()
    committed = sum(r.amount for r in db.query(RecurringExpense)
                    .filter_by(user_id=user.id, active=True).all())

    monthly_income_config = user.monthly_income or 0

    return {
        "month": month,
        "income_this_month": income,
        "expenses_this_month": expenses,
        "balance_this_month": income - expenses,
        "savings_accumulated_this_month": savings_accumulated,
        "monthly_income_configured": monthly_income_config,
        "limits": {
            "necesidades": monthly_income_config * user.necesidades_pct / 100,
            "gustos": monthly_income_config * user.gustos_pct / 100,
            "ahorro": monthly_income_config * user.ahorro_pct / 100,
        },
        "emergency_fund_target": expenses * 6,
        "history": history,
        "top_merchants_month": _top(txs, 6),
        "top_merchants_6m": _top(all_txs, 8),
        "by_subcategory": sorted(by_subcat.items(), key=lambda x: x[1], reverse=True)[:8],
        "goals": [(g.name, g.saved_amount, g.target_amount, g.is_done) for g in goals],
        "recurring_committed": committed,
        "pending_review": sum(1 for t in txs if t.needs_review),
    }


def _format_context(ctx: dict) -> str:
    lines = [
        f"Mes actual: {ctx['month']}",
        f"Ingresos del mes: ${ctx['income_this_month']:,.0f}",
        f"Gastos del mes: ${ctx['expenses_this_month']:,.0f}",
        f"Balance del mes: ${ctx['balance_this_month']:,.0f}",
        f"Ingreso mensual configurado: ${ctx['monthly_income_configured']:,.0f}",
        f"Limites de presupuesto: necesidades ${ctx['limits']['necesidades']:,.0f} | "
        f"gustos ${ctx['limits']['gustos']:,.0f} | ahorro ${ctx['limits']['ahorro']:,.0f}",
        f"Gastos fijos mensuales comprometidos: ${ctx['recurring_committed']:,.0f}",
        f"Transacciones pendientes de revisar: {ctx['pending_review']}",
        f"Meta fondo de emergencia (6 meses de gastos): ${ctx['emergency_fund_target']:,.0f}",
    ]
    if ctx["history"]:
        lines.append("Historial (ultimos meses):")
        lines += [f"  {m}: ingresos ${i:,.0f}, gastos ${e:,.0f}" for m, i, e in ctx["history"]]
    if ctx["by_subcategory"]:
        lines.append("Gasto del mes por categoria:")
        lines += [f"  {c}: ${a:,.0f}" for c, a in ctx["by_subcategory"]]
    if ctx["top_merchants_month"]:
        lines.append("Top comercios del mes:")
        lines += [f"  {m}: ${a:,.0f}" for m, a in ctx["top_merchants_month"]]
    if ctx["top_merchants_6m"]:
        lines.append("Top comercios de los ultimos 6 meses:")
        lines += [f"  {m}: ${a:,.0f}" for m, a in ctx["top_merchants_6m"]]
    if ctx["goals"]:
        lines.append("Metas de ahorro:")
        lines += [
            f"  {n}: ${s:,.0f} de ${t:,.0f}" + (" (cumplida)" if d else "")
            for n, s, t, d in ctx["goals"]
        ]
    return "\n".join(lines)


def _rule_based_reply(message: str, ctx: dict) -> str:
    msg_lower = message.lower()
    balance = ctx["balance_this_month"]
    income = ctx["income_this_month"]
    ahorro_limit = ctx["limits"]["ahorro"]
    emergency_target = ctx["emergency_fund_target"]

    if any(word in msg_lower for word in ["deuda", "prestamo", "tarjeta", "credito"]):
        return (
            "Primero que nada, las deudas de alta tasa (tarjetas, prestamos) siempre van antes "
            "que cualquier inversion. Mientras tenes deuda al 5%+ mensual, cualquier rendimiento "
            "de inversion queda por debajo. Pagalas primero, dale."
        )
    if any(word in msg_lower for word in ["emergencia", "colchon", "reserva"]):
        return (
            f"Tu meta de fondo de emergencia es ${emergency_target:,.0f} (6 meses de gastos). "
            f"Una vez canceladas las deudas, dedica el ahorro mensual (${ahorro_limit:,.0f}) "
            "a un FCI money market o caja de ahorro hasta llegar a esa cifra."
        )
    if any(word in msg_lower for word in ["invert", "cedear", "bono", "fci", "plazo fijo"]):
        return (
            "Para invertir en Argentina: cedears para exposicion al dolar y acciones globales, "
            "bonos CER para cubrirte de la inflacion, FCI diversificados para liquidez. "
            "Nunca pongas mas del 30% en un solo instrumento."
        )
    if balance > 0:
        return (
            f"Este mes te sobran ${balance:,.0f} despues de gastos. "
            "Primero asegurate de no tener deudas de alta tasa, despues construi tu fondo de emergencia "
            f"(meta: ${emergency_target:,.0f}), y solo entonces empeza a invertir."
        )
    return (
        f"Tus gastos este mes (${ctx['expenses_this_month']:,.0f}) superaron tus ingresos "
        f"(${income:,.0f}). Antes de pensar en inversiones, revisemos donde recortar."
    )


@router.post("")
async def chat(body: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    message = body.get("message", "").strip()
    history = body.get("history", [])

    if not message:
        return {"reply": "Mandame tu consulta y te ayudo."}

    ctx = _load_financial_context(db, user)

    from ..services import ai_provider
    reply = await ai_provider.chat(message, history, _format_context(ctx))
    if not reply:
        reply = _rule_based_reply(message, ctx)

    return {"reply": reply}


@router.get("/starters")
async def get_starters():
    return {"starters": STARTERS}


