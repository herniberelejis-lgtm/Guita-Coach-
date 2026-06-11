"""Metas de ahorro (con submetas) y gastos fijos/cuotas."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Goal, RecurringExpense, User
from ..security import get_current_user
from ..services.recurring import monthly_committed

router = APIRouter(prefix="/api/goals", tags=["goals"])


# ─── Schemas ────────────────────────────────────────────────────────────────

class GoalPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    target_amount: float = Field(gt=0)
    currency: str = "ARS"
    deadline: Optional[str] = None
    parent_id: Optional[int] = None


class ContributePayload(BaseModel):
    amount: float = Field(gt=0)


class RecurringPayload(BaseModel):
    merchant: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0)
    category: str = "necesidades"
    day_of_month: int = Field(default=1, ge=1, le=28)
    installments_total: int = Field(default=0, ge=0, le=120)


def _goal_dict(g: Goal, children: list | None = None) -> dict:
    pct = round(g.saved_amount / g.target_amount * 100, 1) if g.target_amount > 0 else 0
    return {
        "id": g.id,
        "parent_id": g.parent_id,
        "name": g.name,
        "target_amount": g.target_amount,
        "saved_amount": g.saved_amount,
        "currency": g.currency,
        "deadline": g.deadline,
        "is_done": g.is_done,
        "progress_pct": min(100, pct),
        "subgoals": children or [],
    }


# ─── Metas ──────────────────────────────────────────────────────────────────

@router.get("")
def list_goals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    goals = db.query(Goal).filter_by(user_id=user.id).order_by(Goal.created_at).all()
    by_parent: dict = {}
    for g in goals:
        if g.parent_id:
            by_parent.setdefault(g.parent_id, []).append(_goal_dict(g))
    return [
        _goal_dict(g, by_parent.get(g.id, []))
        for g in goals if not g.parent_id
    ]


@router.post("")
def create_goal(payload: GoalPayload, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.parent_id:
        parent = db.query(Goal).filter_by(id=payload.parent_id, user_id=user.id).first()
        if not parent:
            raise HTTPException(404, "Meta padre no encontrada")
        if parent.parent_id:
            raise HTTPException(400, "Solo se permite un nivel de submetas")
    goal = Goal(
        user_id=user.id,
        name=payload.name.strip(),
        target_amount=payload.target_amount,
        currency=payload.currency if payload.currency in ("ARS", "USD") else "ARS",
        deadline=payload.deadline,
        parent_id=payload.parent_id,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _goal_dict(goal)


@router.post("/{goal_id}/contribute")
def contribute(goal_id: int, payload: ContributePayload,
               db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    goal = db.query(Goal).filter_by(id=goal_id, user_id=user.id).first()
    if not goal:
        raise HTTPException(404, "Meta no encontrada")
    goal.saved_amount += payload.amount
    if goal.saved_amount >= goal.target_amount:
        goal.is_done = True
    # Si es submeta, el aporte también suma a la meta padre
    if goal.parent_id:
        parent = db.query(Goal).filter_by(id=goal.parent_id, user_id=user.id).first()
        if parent:
            parent.saved_amount += payload.amount
            if parent.saved_amount >= parent.target_amount:
                parent.is_done = True
    db.commit()
    return _goal_dict(goal)


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    goal = db.query(Goal).filter_by(id=goal_id, user_id=user.id).first()
    if not goal:
        raise HTTPException(404, "Meta no encontrada")
    db.query(Goal).filter_by(parent_id=goal.id, user_id=user.id).delete()
    db.delete(goal)
    db.commit()
    return {"ok": True}


# ─── Gastos fijos / cuotas ──────────────────────────────────────────────────

@router.get("/recurring")
def list_recurring(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.query(RecurringExpense).filter_by(user_id=user.id).order_by(
        RecurringExpense.active.desc(), RecurringExpense.day_of_month
    ).all()
    return {
        "monthly_committed": monthly_committed(db, user.id),
        "items": [
            {
                "id": i.id,
                "merchant": i.merchant,
                "amount": i.amount,
                "category": i.category,
                "day_of_month": i.day_of_month,
                "installments_total": i.installments_total,
                "installments_paid": i.installments_paid,
                "active": i.active,
            }
            for i in items
        ],
    }


@router.post("/recurring")
def create_recurring(payload: RecurringPayload,
                     db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = RecurringExpense(
        user_id=user.id,
        merchant=payload.merchant.strip(),
        amount=payload.amount,
        category=payload.category,
        day_of_month=payload.day_of_month,
        installments_total=payload.installments_total,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"ok": True, "id": item.id}


@router.delete("/recurring/{item_id}")
def delete_recurring(item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(RecurringExpense).filter_by(id=item_id, user_id=user.id).first()
    if not item:
        raise HTTPException(404, "Gasto fijo no encontrado")
    db.delete(item)
    db.commit()
    return {"ok": True}
