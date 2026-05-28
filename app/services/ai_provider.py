"""
Proveedor de IA abstracto. Selecciona Gemini o Claude según AI_PROVIDER en .env.
Expone: classify(), get_advice(), chat()
"""
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_CHAT = """Sos un asesor financiero personal argentino, directo, empatico y sin vueltas.

Tu marco de trabajo tiene TRES prioridades estrictas en este orden:
1. CANCELAR DEUDAS DE ALTA TASA: Tarjetas de credito, prestamos personales, financieras (cualquier deuda arriba del 5% mensual va primero siempre).
2. FONDO DE EMERGENCIA: Construir un colchon equivalente a 6 meses de gastos totales, en instrumentos liquidos (caja de ahorro, FCI money market).
3. INVERSION DIVERSIFICADA: Solo cuando los pasos 1 y 2 esten cubiertos. Instrumentos: cedears para exposicion al dolar/acciones globales, bonos soberanos CER para cobertura inflacion, FCI diversificados. Nunca mas del 30% en un solo instrumento.

Reglas de comunicacion:
- Tono rioplatense informal pero profesional (vos, che, dale, etc.)
- Respuestas cortas y concretas (maximo 4 oraciones por respuesta)
- Siempre hace referencia a los numeros reales del usuario cuando los tenes
- No uses emojis
- Arranca directo al punto, sin saludar

Contexto financiero del usuario:
{context}
"""


def _get_settings():
    from ..config import get_settings
    return get_settings()


# ── Classify ────────────────────────────────────────────────────────────────

def _classify_prompt(merchant: str, amount: float, source: str) -> str:
    return f"""Clasificá este gasto de un usuario argentino en una de las tres franjas.

Comercio: {merchant}
Monto: ${amount:,.0f} ARS
Fuente: {source}

Franjas:
- necesidades: gastos esenciales (alquiler, supermercado, servicios, transporte, salud)
- gustos: gastos discrecionales (delivery, restaurantes, ropa, entretenimiento, suscripciones)
- ahorro: separación de plata para ahorro

Referencias argentinas:
SUBE=Transporte/necesidades, Rappi/PedidosYa=Delivery/gustos, Coto/DÍA/Carrefour=Supermercado/necesidades,
Spotify/Netflix=Streaming/gustos, EDENOR/METROGAS/AYSA=Servicios/necesidades, Zara/ropa=Compras/gustos

Respondé SOLO con JSON válido, sin texto adicional:
{{
  "category": "necesidades" | "gustos" | "ahorro",
  "subcategory": "string",
  "confidence": 0.0-1.0,
  "reason": "explicación corta en español rioplatense"
}}"""


async def classify(merchant: str, amount: float, source: str) -> dict:
    settings = _get_settings()
    try:
        if settings.ai_provider == "claude" and settings.claude_enabled:
            return await _classify_claude(merchant, amount, source, settings)
        elif settings.gemini_enabled:
            return await _classify_gemini(merchant, amount, source, settings)
    except Exception as e:
        logger.warning("classify failed for %r: %s", merchant, e)
    return {"category": None, "subcategory": None, "confidence": 0.0,
            "rule_used": "error", "ai_reason": "IA no disponible"}


async def _classify_gemini(merchant: str, amount: float, source: str, settings) -> dict:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")
    response = model.generate_content(_classify_prompt(merchant, amount, source))
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text)
    return {
        "category": data.get("category"),
        "subcategory": data.get("subcategory"),
        "confidence": float(data.get("confidence", 0.8)),
        "rule_used": "gemini",
        "ai_reason": data.get("reason", ""),
    }


async def _classify_claude(merchant: str, amount: float, source: str, settings) -> dict:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)
    msg = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=256,
        messages=[{"role": "user", "content": _classify_prompt(merchant, amount, source)}],
    )
    data = json.loads(msg.content[0].text)
    return {
        "category": data.get("category"),
        "subcategory": data.get("subcategory"),
        "confidence": float(data.get("confidence", 0.8)),
        "rule_used": "claude",
        "ai_reason": data.get("reason", ""),
    }


# ── Advice ──────────────────────────────────────────────────────────────────

def _advice_prompt(patterns: dict, focus: str, income: float) -> str:
    top_freq = patterns.get("top_by_frequency", [])
    top_lines = "\n".join(
        f"- {m['merchant']}: {m['count']} veces, ${m['total']:,.0f}"
        for m in top_freq[:5]
    )
    spent = patterns.get("by_category", {}).get(focus, 0)
    limit = income * {"necesidades": 0.5, "gustos": 0.3, "ahorro": 0.2}.get(focus, 0.3)
    return (
        f"Sos un coach financiero argentino, directo y sin vueltas.\n\n"
        f"El usuario tiene un limite de ${limit:,.0f} en {focus} y lleva gastados ${spent:,.0f}.\n"
        f"Sus gastos mas frecuentes en {focus} este mes:\n{top_lines}\n\n"
        f"Escribi DOS consejos muy concretos (maximo 3 oraciones en total). "
        f"Hace referencia directa a los comercios reales. Tono rioplatense informal. "
        f"No uses emojis. Arranca directo sin saludar."
    )


async def get_advice(patterns: dict, focus: str, income: float) -> Optional[str]:
    settings = _get_settings()
    try:
        if settings.ai_provider == "claude" and settings.claude_enabled:
            return await _advice_claude(patterns, focus, income, settings)
        elif settings.gemini_enabled:
            return await _advice_gemini(patterns, focus, income, settings)
    except Exception as e:
        logger.warning("get_advice failed for focus=%r: %s", focus, e)
    return None


async def _advice_gemini(patterns: dict, focus: str, income: float, settings) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.0-flash-lite")
    response = model.generate_content(_advice_prompt(patterns, focus, income))
    return response.text.strip()


async def _advice_claude(patterns: dict, focus: str, income: float, settings) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)
    msg = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        messages=[{"role": "user", "content": _advice_prompt(patterns, focus, income)}],
    )
    return msg.content[0].text.strip()


# ── Chat ────────────────────────────────────────────────────────────────────

async def chat(message: str, history: list, financial_context: str) -> Optional[str]:
    settings = _get_settings()
    try:
        if settings.ai_provider == "claude" and settings.claude_enabled:
            return await _chat_claude(message, history, financial_context, settings)
        elif settings.gemini_enabled:
            return await _chat_gemini(message, history, financial_context, settings)
    except Exception as e:
        logger.warning("chat failed: %s", e)
    return None


async def _chat_gemini(message: str, history: list, financial_context: str, settings) -> str:
    import google.generativeai as genai
    genai.configure(api_key=settings.gemini_api_key)
    system = SYSTEM_PROMPT_CHAT.format(context=financial_context)
    model = genai.GenerativeModel("gemini-2.0-flash-lite", system_instruction=system)

    gemini_history = []
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role == "user" and content:
            gemini_history.append({"role": "user", "parts": [content]})
        elif role == "assistant" and content:
            gemini_history.append({"role": "model", "parts": [content]})

    chat_session = model.start_chat(history=gemini_history)
    response = chat_session.send_message(message)
    return response.text.strip()


async def _chat_claude(message: str, history: list, financial_context: str, settings) -> str:
    import anthropic
    system = SYSTEM_PROMPT_CHAT.format(context=financial_context)
    messages = []
    for turn in history[-10:]:
        role = turn.get("role")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})
    client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)
    resp = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=400,
        system=system,
        messages=messages,
    )
    return resp.content[0].text.strip()
