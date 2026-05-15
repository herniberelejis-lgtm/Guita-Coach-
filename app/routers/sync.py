"""Sync endpoints — Gmail y Mercado Pago."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Connection, Transaction
from ..services.classifier import classify
from ..services.alert_engine import run_alert_engine

router = APIRouter(prefix="/api/sync", tags=["sync"])


async def _save_transactions(items: list[dict], db: Session):
    saved = 0
    for item in items:
        raw_ref = str(item.get("raw_reference", ""))
        exists = db.query(Transaction).filter(
            Transaction.user_id == 1,
            Transaction.raw_reference == raw_ref,
            Transaction.source == item["source"],
        ).first() if raw_ref else None

        if exists:
            continue

        result = await classify(item["merchant"], item["amount"], item["source"], db)

        tx = Transaction(
            user_id=1,
            source=item["source"],
            provider=item.get("provider", ""),
            merchant=item["merchant"],
            amount=item["amount"],
            date=item["date"],
            month=item["date"][:7],
            category=result["category"],
            subcategory=result.get("subcategory", ""),
            status="confirmed",
            confidence=result.get("confidence", 0.7),
            rule_used=result.get("rule_used"),
            ai_reason=result.get("reason"),
            raw_reference=raw_ref,
            needs_review=result.get("needs_review", False),
        )
        db.add(tx)
        saved += 1

    db.commit()
    return saved


@router.post("/gmail")
async def sync_gmail(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(user_id=1, provider="gmail").first()
    if not conn or conn.status != "connected" or not conn.access_token:
        raise HTTPException(400, "Gmail no conectado. Conectalo desde Configuración.")

    from ..services.gmail import fetch_payment_emails
    try:
        items = await fetch_payment_emails(conn.access_token)
    except Exception as e:
        raise HTTPException(502, f"Error al leer Gmail: {str(e)}")

    saved = await _save_transactions(items, db)

    conn.last_sync = datetime.utcnow()
    db.commit()

    background_tasks.add_task(run_alert_engine, 1, db)

    return {"ok": True, "fetched": len(items), "saved": saved}


@router.post("/mp")
async def sync_mp(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    conn = db.query(Connection).filter_by(user_id=1, provider="mercadopago").first()
    if not conn or conn.status != "connected" or not conn.access_token:
        raise HTTPException(400, "Mercado Pago no conectado. Conectalo desde Configuración.")

    from ..services.mercadopago import fetch_movements
    try:
        items = await fetch_movements(conn.access_token)
    except Exception as e:
        raise HTTPException(502, f"Error al leer Mercado Pago: {str(e)}")

    saved = await _save_transactions(items, db)

    conn.last_sync = datetime.utcnow()
    db.commit()

    background_tasks.add_task(run_alert_engine, 1, db)

    return {"ok": True, "fetched": len(items), "saved": saved}


@router.get("/status")
def sync_status(db: Session = Depends(get_db)):
    conns = db.query(Connection).filter_by(user_id=1).all()
    return {
        c.provider: {
            "status": c.status,
            "last_sync": c.last_sync.isoformat() if c.last_sync else None,
        }
        for c in conns
    }
