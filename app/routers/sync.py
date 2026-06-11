"""Sync endpoints — Gmail y Mercado Pago."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Connection, Transaction, User
from ..security import get_current_user
from ..services.dedup import find_cross_source_duplicate, mark_duplicates_and_transfers
from ..services.classifier import classify
from ..services.alert_engine import run_alert_engine

router = APIRouter(prefix="/api/sync", tags=["sync"])


async def _save_transaction_item(item: dict, user_id: int, db: Session) -> bool:
    """Save one transaction. Returns True if saved, False if duplicate."""
    raw_ref = str(item.get("id") or item.get("raw_reference", ""))
    source = item.get("source", "")

    if raw_ref:
        exists = db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.raw_reference == raw_ref,
            Transaction.source == source,
        ).first()
        if exists:
            return False

    dup = find_cross_source_duplicate(db, user_id, item)

    tx_type = item.get("tx_type", "expense")

    if tx_type == "income":
        tx = Transaction(
            user_id=user_id,
            source=source,
            tx_type="income",
            amount=item["amount"],
            currency=item.get("currency", "ARS"),
            date=item["date"],
            month=item.get("month", item["date"][:7]),
            merchant=item.get("merchant", ""),
            provider=item.get("provider", ""),
            category="ingreso",
            subcategory="",
            status="confirmed",
            confidence=1.0,
            needs_review=item.get("needs_review", False),
            raw_reference=raw_ref,
            is_duplicate=dup is not None,
        )
    else:
        result = await classify(
            item.get("merchant", ""),
            item.get("amount", 0),
            source,
            db,
            user_id=user_id,
        )
        tx = Transaction(
            user_id=user_id,
            source=source,
            tx_type="expense",
            amount=item["amount"],
            currency=item.get("currency", "ARS"),
            date=item["date"],
            month=item.get("month", item["date"][:7]),
            merchant=item.get("merchant", ""),
            provider=item.get("provider", ""),
            category=result["category"],
            subcategory=result.get("subcategory", ""),
            status="confirmed",
            confidence=result.get("confidence", 0.7),
            rule_used=result.get("rule_used"),
            ai_reason=result.get("reason"),
            needs_review=item.get("needs_review", False) or result.get("needs_review", False),
            raw_reference=raw_ref,
            is_duplicate=dup is not None,
        )

    db.add(tx)
    db.commit()
    return True


async def _save_transactions(items: list[dict], user_id: int, db: Session) -> int:
    """Save a list of transaction items. Returns count of newly saved."""
    saved = 0
    for item in items:
        if await _save_transaction_item(item, user_id=user_id, db=db):
            saved += 1
    return saved


@router.post("/gmail")
async def sync_gmail(background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = db.query(Connection).filter_by(user_id=user.id, provider="gmail").first()
    if not conn or conn.status != "connected" or not conn.access_token:
        raise HTTPException(400, "Gmail no conectado. Conectalo desde Configuración.")

    from ..services.gmail import fetch_payment_emails
    try:
        items = await fetch_payment_emails(conn.access_token)
    except Exception as e:
        raise HTTPException(502, f"Error al leer Gmail: {str(e)}")

    saved = await _save_transactions(items, user_id=user.id, db=db)

    conn.last_sync = datetime.utcnow()
    db.commit()
    flagged = mark_duplicates_and_transfers(db, user.id)

    background_tasks.add_task(run_alert_engine, user.id, db)

    return {"ok": True, "fetched": len(items), "saved": saved, "flagged": flagged}


@router.post("/mp")
async def sync_mp(background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conn = db.query(Connection).filter_by(user_id=user.id, provider="mercadopago").first()
    if not conn or conn.status != "connected" or not conn.access_token:
        raise HTTPException(400, "Mercado Pago no conectado. Conectalo desde Configuración.")

    from ..services.mercadopago import fetch_movements
    try:
        items = await fetch_movements(conn.access_token)
    except Exception as e:
        raise HTTPException(502, f"Error al leer Mercado Pago: {str(e)}")

    saved = await _save_transactions(items, user_id=user.id, db=db)

    conn.last_sync = datetime.utcnow()
    db.commit()
    flagged = mark_duplicates_and_transfers(db, user.id)

    background_tasks.add_task(run_alert_engine, user.id, db)

    return {"ok": True, "fetched": len(items), "saved": saved, "flagged": flagged}


@router.get("/status")
def sync_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    conns = db.query(Connection).filter_by(user_id=user.id).all()
    return {
        c.provider: {
            "status": c.status,
            "last_sync": c.last_sync.isoformat() if c.last_sync else None,
        }
        for c in conns
    }
