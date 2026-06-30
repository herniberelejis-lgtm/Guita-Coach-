"""Sync endpoints — Gmail, Mercado Pago, y Plaid."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Connection, Transaction, User
from ..security import get_current_user
from ..services.dedup import find_cross_source_duplicate, mark_duplicates_and_transfers
from ..services.splits import detect_split_candidates
from ..services.classifier import classify
from ..services.alert_engine import run_alert_engine
from ..services.plaid_sync import plaid_client

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
    payment_method = item.get("payment_method", "") or ""

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
            payment_method=payment_method,
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
            payment_method=payment_method,
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
    splits = detect_split_candidates(db, user.id)

    background_tasks.add_task(run_alert_engine, user.id, db)

    return {"ok": True, "fetched": len(items), "saved": saved, "flagged": flagged, "split_suggestions": splits}


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
    splits = detect_split_candidates(db, user.id)

    background_tasks.add_task(run_alert_engine, user.id, db)

    return {"ok": True, "fetched": len(items), "saved": saved, "flagged": flagged, "split_suggestions": splits}


@router.post("/csv")
async def sync_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Importa el estado de cuenta de MP (CSV). Cubre compras con tarjeta
    que la API pública no expone. Deduplica contra lo ya sincronizado."""
    if file.size and file.size > 5_000_000:
        raise HTTPException(413, "Archivo muy grande (máximo 5 MB)")
    content = await file.read()
    from ..services.csv_import import parse_mp_csv
    try:
        items = parse_mp_csv(content)
    except ValueError as e:
        raise HTTPException(400, str(e))

    saved = await _save_transactions(items, user_id=user.id, db=db)
    flagged = mark_duplicates_and_transfers(db, user.id)
    splits = detect_split_candidates(db, user.id)
    background_tasks.add_task(run_alert_engine, user.id, db)
    return {"ok": True, "fetched": len(items), "saved": saved,
            "flagged": flagged, "split_suggestions": splits}


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


# === PLAID ENDPOINTS ===

@router.post("/plaid/link_token")
async def get_plaid_link_token(user: User = Depends(get_current_user)):
    """Obtener link token para conectar con Plaid"""
    link_token = await plaid_client.create_link_token(user.id, user.email)
    if not link_token:
        raise HTTPException(status_code=400, detail="Error creando link token de Plaid")
    return {"link_token": link_token}


@router.post("/plaid/exchange_token")
async def exchange_plaid_token(
    public_token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Intercambiar public token por access token y guardar conexión"""
    access_token = await plaid_client.exchange_token(public_token)
    if not access_token:
        raise HTTPException(status_code=400, detail="Error intercambiando token")

    # Guardar o actualizar conexión en DB
    connection = db.query(Connection).filter_by(
        user_id=user.id,
        provider='plaid'
    ).first()

    if connection:
        connection.access_token = access_token
        connection.status = 'connected'
        connection.last_sync = datetime.utcnow()
    else:
        connection = Connection(
            user_id=user.id,
            provider='plaid',
            access_token=access_token,
            status='connected',
            last_sync=datetime.utcnow()
        )
        db.add(connection)

    db.commit()
    return {"status": "connected", "message": "Banco conectado exitosamente"}


@router.post("/plaid/sync")
async def sync_plaid_transactions(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sincronizar transacciones desde Plaid"""
    connection = db.query(Connection).filter_by(
        user_id=user.id,
        provider='plaid'
    ).first()

    if not connection:
        raise HTTPException(status_code=400, detail="Plaid no está conectado")

    # Obtener transacciones
    transactions = await plaid_client.get_transactions(connection.access_token, days=90)

    # Convertir formato Plaid al formato esperado
    items = []
    for txn in transactions:
        item = {
            "id": txn.get("transaction_id"),
            "date": txn.get("date"),
            "amount": abs(float(txn.get("amount", 0))),
            "merchant": txn.get("name", "Transacción"),
            "category": txn.get("personal_finance_category", {}).get("primary", "Otros") if txn.get("personal_finance_category") else "Otros",
            "tx_type": "income" if float(txn.get("amount", 0)) > 0 else "expense",
            "source": "plaid",
            "payment_method": "Transferencia",
            "currency": "ARS",
            "raw_reference": txn.get("transaction_id", ""),
        }
        items.append(item)

    # Guardar transacciones
    saved = await _save_transactions(items, user_id=user.id, db=db)

    connection.last_sync = datetime.utcnow()
    db.commit()

    # Ejecutar deduplicación y alertas
    flagged = mark_duplicates_and_transfers(db, user.id)
    splits = detect_split_candidates(db, user.id)
    background_tasks.add_task(run_alert_engine, user.id, db)

    return {
        "ok": True,
        "fetched": len(transactions),
        "saved": saved,
        "flagged": flagged,
        "split_suggestions": splits
    }
