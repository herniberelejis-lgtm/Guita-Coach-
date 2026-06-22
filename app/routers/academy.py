"""Guita Coach Academy — contenido educativo fijo, priorizado por perfil del usuario."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Investment
from ..security import get_current_user
from ..services.academy_content import TOPICS, CATEGORY_LABELS, GLOSSARY

router = APIRouter(prefix="/api/academy", tags=["academy"])


def _build_profile(user: User, investments: list[Investment]) -> dict:
    asset_types = {inv.asset_type for inv in investments if inv.asset_type}
    return {
        "is_beginner": len(investments) == 0,
        "crypto_only": bool(asset_types) and asset_types == {"crypto"},
        "low_buffer": (user.ahorro_pct or 0) < 10,
        "variable_income": bool(getattr(user, "income_is_variable", False)),
        "diversified": len(asset_types) >= 2,
    }


def _score(topic: dict, profile: dict) -> int:
    return sum(1 for tag in topic["tags"] if profile.get(tag))


@router.get("")
def get_academy(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    investments = db.query(Investment).filter(
        Investment.user_id == user.id,
        Investment.status == "open",
    ).all()
    profile = _build_profile(user, investments)

    scored = [{**t, "score": _score(t, profile)} for t in TOPICS]
    recommended = sorted([t for t in scored if t["score"] > 0], key=lambda t: -t["score"])[:4]
    if not recommended:
        recommended = [t for t in scored if t["category"] == "primeros_pasos"]

    by_category: dict = {}
    for t in scored:
        by_category.setdefault(t["category"], []).append(t)

    categories = [
        {"category": cat, "label": CATEGORY_LABELS.get(cat, cat), "topics": topics}
        for cat, topics in by_category.items()
    ]

    return {
        "recommended": [{k: v for k, v in t.items() if k != "score"} for t in recommended],
        "categories": categories,
        "glossary": GLOSSARY,
    }
