"""Transactions CRUD + category correction."""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, CategoryRule
from ..services.alert_engine import run_alert_engine

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class ManualTransaction(BaseModel):
    merchant: str
    amount: float
    date: str
    category: str
    subcategory: str = ""


class CategoryCorrection(BaseModel):
    category: str
    subcategory: str = ""
    save_rule: bool = True


@router.get("")
def list_transactions(
    month: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(Transaction.user_id == 1)

    if month:
        q = q.filter(Transaction.month == month)
    else:
        current_month = date.today().strftime("%Y-%m")
        q = q.filter(Transaction.month == current_month)

    if category:
        q = q.filter(Transaction.category == category)

    if search:
        q = q.filter(Transaction.merchant.ilike(f"%{search}%"))

    q = q.filter(Transaction.status.in_(["confirmed", "classified"]))

    total = q.count()
    txs = q.order_by(Transaction.date.desc()).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [_tx_dict(t) for t in txs],
    }


@router.get("/needs-review")
def list_needs_review(db: Session = Depends(get_db)):
    txs = db.query(Transaction).filter(
        Transaction.user_id == 1,
        Transaction.needs_review == True
    ).order_by(Transaction.date.desc()).all()
    return [_tx_dict(t) for t in txs]


@router.post("")
async def add_manual_transaction(payload: ManualTransaction, db: Session = Depends(get_db)):
    tx = Transaction(
        user_id=1,
        source="manual",
        provider="Manual",
        merchant=payload.merchant,
        amount=payload.amount,
        date=payload.date,
        month=payload.date[:7],
        category=payload.category,
        subcategory=payload.subcategory,
        status="confirmed",
        confidence=1.0,
        needs_review=False,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    await run_alert_engine(1, db)
    return _tx_dict(tx)


@router.patch("/{tx_id}/category")
async def correct_category(
    tx_id: int,
    payload: CategoryCorrection,
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter_by(id=tx_id, user_id=1).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")

    tx.category = payload.category
    tx.subcategory = payload.subcategory
    tx.needs_review = False
    tx.confidence = 1.0
    tx.rule_used = "manual_correction"

    if payload.save_rule:
        pattern = tx.merchant.lower().split()[0] if tx.merchant else ""
        if pattern:
            existing = db.query(CategoryRule).filter_by(
                user_id=1, pattern=pattern
            ).first()
            if existing:
                existing.category = payload.category
                existing.subcategory = payload.subcategory
            else:
                db.add(CategoryRule(
                    user_id=1,
                    pattern=pattern,
                    category=payload.category,
                    subcategory=payload.subcategory,
                    priority=10,
                    from_correction=True,
                ))

    db.commit()
    return _tx_dict(tx)


@router.delete("/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter_by(id=tx_id, user_id=1).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")
    db.delete(tx)
    db.commit()
    return {"ok": True}


def _tx_dict(t: Transaction) -> dict:
    return {
        "id": t.id,
        "merchant": t.merchant,
        "amount": t.amount,
        "date": t.date,
        "month": t.month,
        "category": t.category,
        "subcategory": t.subcategory,
        "source": t.source,
        "provider": t.provider,
        "confidence": t.confidence,
        "needs_review": t.needs_review,
        "ai_reason": t.ai_reason,
        "status": t.status,
    }
