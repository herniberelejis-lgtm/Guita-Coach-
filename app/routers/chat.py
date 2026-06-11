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


def _load_financial_context(db: Session, user: User) -> dict:
    from datetime import date
    month = date.today().strftime("%Y-%m")

    txs = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.month == month,
        Transaction.is_internal_transfer == False,
        Transaction.is_duplicate == False,
    ).all()

    income = sum(t.amount for t in txs if t.tx_type == "income")
    expenses = sum(t.amount for t in txs if t.tx_type == "expense")
    savings_accumulated = sum(t.amount for t in txs if t.category == "ahorro")

    monthly_income_config = user.monthly_income if user else 0
    necesidades_limit = monthly_income_config * (user.necesidades_pct / 100) if user else 0
    gustos_limit = monthly_income_config * (user.gustos_pct / 100) if user else 0
    ahorro_limit = monthly_income_config * (user.ahorro_pct / 100) if user else 0

    return {
        "month": month,
        "income_this_month": income,
        "expenses_this_month": expenses,
        "balance_this_month": income - expenses,
        "savings_accumulated_this_month": savings_accumulated,
        "monthly_income_configured": monthly_income_config,
        "limits": {
            "necesidades": necesidades_limit,
            "gustos": gustos_limit,
            "ahorro": ahorro_limit,
        },
        "emergency_fund_target": expenses * 6,
    }


def _format_context(ctx: dict) -> str:
    return (
        f"Mes actual: {ctx['month']}\n"
        f"Ingresos del mes: ${ctx['income_this_month']:,.0f}\n"
        f"Gastos del mes: ${ctx['expenses_this_month']:,.0f}\n"
        f"Balance disponible: ${ctx['balance_this_month']:,.0f}\n"
        f"Ingreso mensual configurado: ${ctx['monthly_income_configured']:,.0f}\n"
        f"Limite necesidades: ${ctx['limits']['necesidades']:,.0f}\n"
        f"Limite gustos: ${ctx['limits']['gustos']:,.0f}\n"
        f"Meta ahorro mensual: ${ctx['limits']['ahorro']:,.0f}\n"
        f"Ahorro acumulado este mes: ${ctx['savings_accumulated_this_month']:,.0f}\n"
        f"Meta fondo de emergencia (6 meses de gastos): ${ctx['emergency_fund_target']:,.0f}"
    )


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


