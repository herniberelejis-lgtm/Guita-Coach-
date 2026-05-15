# tests/test_sync_tx_type.py
import asyncio
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction

@pytest.fixture
def mem_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()
    engine.dispose()

def test_income_saved_with_ingreso_category(mem_db):
    from app.routers.sync import _save_transaction_item
    item = {
        "id": "mp_col_001",
        "source": "mercadopago",
        "tx_type": "income",
        "amount": 10000.0,
        "currency": "ARS",
        "date": "2026-05-10",
        "month": "2026-05-",
        "merchant": "Transferencia recibida",
        "provider": "MercadoPago",
        "needs_review": False,
        "raw_reference": "mp_col_001",
    }
    saved = asyncio.run(_save_transaction_item(item, user_id=1, db=mem_db))
    assert saved is True
    tx = mem_db.query(Transaction).filter_by(tx_type="income").first()
    assert tx is not None
    assert tx.category == "ingreso"
    assert tx.tx_type == "income"
    assert tx.confidence == 1.0

def test_income_not_classified(mem_db):
    """Income items bypass the classifier — no rule_used, no ai_reason from classifier."""
    from app.routers.sync import _save_transaction_item
    item = {
        "id": "mp_col_002",
        "source": "mercadopago",
        "tx_type": "income",
        "amount": 5000.0,
        "currency": "ARS",
        "date": "2026-05-11",
        "month": "2026-05",
        "merchant": "Sueldo",
        "provider": "MercadoPago",
        "needs_review": False,
        "raw_reference": "mp_col_002",
    }
    asyncio.run(_save_transaction_item(item, user_id=1, db=mem_db))
    tx = mem_db.query(Transaction).filter_by(merchant="Sueldo").first()
    assert tx.tx_type == "income"
    assert tx.category == "ingreso"

def test_expense_gets_tx_type_expense(mem_db):
    """Expense items are saved with tx_type='expense'."""
    from app.routers.sync import _save_transaction_item
    item = {
        "id": "mp_001",
        "source": "mercadopago",
        "tx_type": "expense",
        "amount": 500.0,
        "currency": "ARS",
        "date": "2026-05-10",
        "month": "2026-05",
        "merchant": "Supermercado Dia",
        "provider": "MercadoPago",
        "needs_review": False,
        "raw_reference": "mp_001",
    }
    asyncio.run(_save_transaction_item(item, user_id=1, db=mem_db))
    tx = mem_db.query(Transaction).filter_by(tx_type="expense").first()
    assert tx is not None
    assert tx.tx_type == "expense"

def test_duplicate_not_saved(mem_db):
    """Same raw_reference + source = not saved twice."""
    from app.routers.sync import _save_transaction_item
    item = {
        "id": "mp_dup_001",
        "source": "mercadopago",
        "tx_type": "income",
        "amount": 1000.0,
        "currency": "ARS",
        "date": "2026-05-10",
        "month": "2026-05",
        "merchant": "Duplicado",
        "provider": "MercadoPago",
        "needs_review": False,
        "raw_reference": "mp_dup_001",
    }
    asyncio.run(_save_transaction_item(item, user_id=1, db=mem_db))
    asyncio.run(_save_transaction_item(item, user_id=1, db=mem_db))
    count = mem_db.query(Transaction).filter_by(raw_reference="mp_dup_001").count()
    assert count == 1
