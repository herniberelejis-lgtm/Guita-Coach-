"""Transactions CRUD + category correction."""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Transaction, CategoryRule, User
from ..security import get_current_user
from ..services.alert_engine import run_alert_engine

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class ManualTransaction(BaseModel):
    merchant: str
    amount: float
    date: str
    tx_type: str = "expense"
    category: str = ""
    subcategory: str = ""
    payment_method: str = ""


class CategoryCorrection(BaseModel):
    category: str
    subcategory: str = ""
    save_rule: bool = True


@router.get("")
def list_transactions(
    month: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    payment_method: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Transaction).filter(Transaction.user_id == user.id)

    if month:
        q = q.filter(Transaction.month == month)
    else:
        current_month = date.today().strftime("%Y-%m")
        q = q.filter(Transaction.month == current_month)

    if category:
        q = q.filter(Transaction.category == category)

    if payment_method:
        q = q.filter(Transaction.payment_method == payment_method)

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
def list_needs_review(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    txs = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.needs_review == True
    ).order_by(Transaction.date.desc()).all()
    return [_tx_dict(t) for t in txs]


@router.post("/reclassify")
async def reclassify_pending(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Re-clasifica con IA (reglas + Gemini/Claude) los gastos pendientes de
    categoría. Devuelve cuántos se catalogaron."""
    from ..services.classifier import classify
    pending = db.query(Transaction).filter(
        Transaction.user_id == user.id,
        Transaction.needs_review == True,
        Transaction.tx_type == "expense",
    ).all()

    classified = 0
    for tx in pending:
        result = await classify(tx.merchant or "", tx.amount or 0, tx.source or "manual",
                                db, user_id=user.id)
        category = result.get("category")
        if not category:
            continue
        tx.category = category
        tx.subcategory = result.get("subcategory", "") or tx.subcategory
        tx.confidence = result.get("confidence", 0.8)
        tx.rule_used = result.get("rule_used")
        tx.ai_reason = result.get("reason") or result.get("ai_reason")
        tx.needs_review = result.get("confidence", 0.8) < 0.85
        if not tx.needs_review:
            classified += 1
    db.commit()
    return {"ok": True, "pending": len(pending), "classified": classified}


@router.post("")
async def add_manual_transaction(payload: ManualTransaction, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if payload.tx_type == "income":
        category = "ingreso"
        subcategory = payload.subcategory or ""
        confidence = 1.0
        needs_review = False
    else:
        if payload.category:
            category = payload.category
            subcategory = payload.subcategory
            confidence = 1.0
            needs_review = False
        else:
            from ..services.classifier import classify
            result = await classify(payload.merchant, payload.amount, "manual", db, user_id=user.id)
            category = result.get("category") or "gustos"
            subcategory = result.get("subcategory", "")
            confidence = result.get("confidence", 0.7)
            needs_review = not category

    from ..services.payment_method import normalize_method
    tx = Transaction(
        user_id=user.id,
        source="manual",
        tx_type=payload.tx_type,
        provider="Manual",
        merchant=payload.merchant,
        amount=payload.amount,
        date=payload.date,
        month=payload.date[:7],
        category=category,
        subcategory=subcategory,
        status="confirmed",
        confidence=confidence,
        payment_method=normalize_method(payload.payment_method),
        needs_review=needs_review,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    from ..services.dedup import mark_duplicates_and_transfers
    mark_duplicates_and_transfers(db, user.id, tx.month)
    run_alert_engine(user.id, db)
    return _tx_dict(tx)


@router.patch("/{tx_id}/category")
async def correct_category(
    tx_id: int,
    payload: CategoryCorrection,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = db.query(Transaction).filter_by(id=tx_id, user_id=user.id).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")

    tx.category = payload.category
    tx.subcategory = payload.subcategory
    tx.needs_review = False
    tx.confidence = 1.0
    tx.rule_used = "manual_correction"

    if payload.save_rule:
        pattern = tx.merchant.lower().strip() if tx.merchant else ""
        if pattern:
            existing = db.query(CategoryRule).filter_by(
                user_id=user.id, pattern=pattern
            ).first()
            if existing:
                existing.category = payload.category
                existing.subcategory = payload.subcategory
            else:
                db.add(CategoryRule(
                    user_id=user.id,
                    pattern=pattern,
                    category=payload.category,
                    subcategory=payload.subcategory,
                    priority=10,
                    from_correction=True,
                ))

    db.commit()
    return _tx_dict(tx)


class SplitConfirmPayload(BaseModel):
    income_ids: list[int]
    alert_id: int | None = None


@router.post("/{tx_id}/split-confirm")
def confirm_split_endpoint(
    tx_id: int,
    payload: SplitConfirmPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Confirma que las entradas son devoluciones de un gasto compartido."""
    from ..services.splits import confirm_split
    from ..models import Alert
    try:
        result = confirm_split(db, user.id, tx_id, payload.income_ids)
    except ValueError as e:
        raise HTTPException(404, str(e))
    if payload.alert_id:
        alert = db.query(Alert).filter_by(id=payload.alert_id, user_id=user.id).first()
        if alert:
            alert.is_read = True
            db.commit()
    return result


@router.delete("/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter_by(id=tx_id, user_id=user.id).first()
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
        "tx_type": t.tx_type,
        "category": t.category,
        "subcategory": t.subcategory,
        "source": t.source,
        "provider": t.provider,
        "payment_method": getattr(t, "payment_method", "") or "",
        "confidence": t.confidence,
        "needs_review": t.needs_review,
        "is_internal_transfer": bool(getattr(t, "is_internal_transfer", False)),
        "is_duplicate": bool(getattr(t, "is_duplicate", False)),
        "ai_reason": t.ai_reason,
        "status": t.status,
    }
