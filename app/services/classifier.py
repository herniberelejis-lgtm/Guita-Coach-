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

def classify_by_rules(merchant: str, db: Session, user_id: int = 1) -> Optional[dict]:
    n = _normalize(merchant)

    user_rules = db.query(CategoryRule).filter_by(user_id=user_id).order_by(CategoryRule.priority.desc()).all()
    for rule in user_rules:
        if _normalize(rule.pattern) in n:
            return {"category": rule.category, "subcategory": rule.subcategory,
                    "confidence": 0.95, "rule_used": f"user:{rule.pattern}"}

    for pattern, category, subcategory in GLOBAL_RULES:
        if pattern in n:
            return {"category": category, "subcategory": subcategory,
                    "confidence": 0.85, "rule_used": f"global:{pattern}"}

    return None

async def classify(merchant: str, amount: float, source: str, db: Session, user_id: int = 1) -> dict:
    result = classify_by_rules(merchant, db, user_id)
    if result and result["confidence"] >= 0.85:
        return result

    from . import ai_provider
    ai_result = await ai_provider.classify(merchant, amount, source)
    if ai_result.get("confidence", 0) >= 0.85:
        return ai_result

    if result:
        return result

    return (ai_result or {}) | {"needs_review": True}
