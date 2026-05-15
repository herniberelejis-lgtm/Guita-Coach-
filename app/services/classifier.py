"""
Clasificación de gastos:
  1. Reglas del usuario (prioridad máxima)
  2. Reglas globales predefinidas
  3. Claude API (si CLAUDE_API_KEY está configurada y confianza < 85%)
"""
import json
import unicodedata
from typing import Optional
from sqlalchemy.orm import Session
from ..models import CategoryRule

GLOBAL_RULES = [
    ("rappi", "gustos", "Delivery"),
    ("pedidosya", "gustos", "Delivery"),
    ("glovo", "gustos", "Delivery"),
    ("spotify", "gustos", "Streaming"),
    ("netflix", "gustos", "Streaming"),
    ("disney", "gustos", "Streaming"),
    ("hbo", "gustos", "Streaming"),
    ("amazon prime", "gustos", "Streaming"),
    ("sube", "necesidades", "Transporte"),
    ("cabify", "necesidades", "Transporte"),
    ("uber", "necesidades", "Transporte"),
    ("farmacia", "necesidades", "Salud"),
    ("coto", "necesidades", "Supermercado"),
    ("dia", "necesidades", "Supermercado"),
    ("carrefour", "necesidades", "Supermercado"),
    ("jumbo", "necesidades", "Supermercado"),
    ("disco", "necesidades", "Supermercado"),
    ("supermercado", "necesidades", "Supermercado"),
    ("alquiler", "necesidades", "Vivienda"),
    ("edenor", "necesidades", "Servicios"),
    ("metrogas", "necesidades", "Servicios"),
    ("aysa", "necesidades", "Servicios"),
    ("fibertel", "necesidades", "Servicios"),
    ("claro", "necesidades", "Servicios"),
    ("personal", "necesidades", "Servicios"),
    ("movistar", "necesidades", "Servicios"),
    ("telecentro", "necesidades", "Servicios"),
    ("zara", "gustos", "Compras"),
    ("h&m", "gustos", "Compras"),
    ("adidas", "gustos", "Compras"),
    ("ahorro", "ahorro", "Ahorro mensual"),
    ("restaurante", "gustos", "Restaurantes"),
    ("cantina", "gustos", "Restaurantes"),
    ("peluqueria", "gustos", "Personal"),
    ("peluquería", "gustos", "Personal"),
    ("veterinaria", "necesidades", "Salud"),
]

def _normalize(s: str) -> str:
    return unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode().strip()

def classify_by_rules(merchant: str, db: Session) -> Optional[dict]:
    n = _normalize(merchant)

    user_rules = db.query(CategoryRule).filter_by(user_id=1).order_by(CategoryRule.priority.desc()).all()
    for rule in user_rules:
        if _normalize(rule.pattern) in n:
            return {"category": rule.category, "subcategory": rule.subcategory,
                    "confidence": 0.95, "rule_used": f"user:{rule.pattern}"}

    for pattern, category, subcategory in GLOBAL_RULES:
        if pattern in n:
            return {"category": category, "subcategory": subcategory,
                    "confidence": 0.85, "rule_used": f"global:{pattern}"}

    return None

async def classify_with_claude(merchant: str, amount: float, source: str) -> dict:
    from ..config import get_settings
    settings = get_settings()
    if not settings.claude_enabled:
        return {"category": None, "subcategory": None, "confidence": 0.3,
                "rule_used": "none", "ai_reason": "Claude API no configurada"}

    import anthropic
    client = anthropic.Anthropic(api_key=settings.claude_api_key)

    prompt = f"""Clasificá este gasto de un usuario argentino en una de las tres franjas.

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

    try:
        msg = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}]
        )
        data = json.loads(msg.content[0].text)
        return {
            "category": data.get("category"),
            "subcategory": data.get("subcategory"),
            "confidence": float(data.get("confidence", 0.8)),
            "rule_used": "claude",
            "ai_reason": data.get("reason", ""),
        }
    except Exception as e:
        return {"category": None, "subcategory": None, "confidence": 0.0,
                "rule_used": "error", "ai_reason": str(e)}

async def classify(merchant: str, amount: float, source: str, db: Session) -> dict:
    result = classify_by_rules(merchant, db)
    if result and result["confidence"] >= 0.85:
        return result

    claude_result = await classify_with_claude(merchant, amount, source)
    if claude_result["confidence"] >= 0.85:
        return claude_result

    if result:
        return result

    return claude_result | {"needs_review": True}
