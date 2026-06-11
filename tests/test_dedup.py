"""Tests de detección de duplicados y transferencias internas."""
import pytest
from sqlalchemy.orm import sessionmaker

from app.models import Base, Transaction
from app.services.dedup import find_cross_source_duplicate, mark_duplicates_and_transfers


@pytest.fixture
def db(use_test_db):
    Base.metadata.create_all(bind=use_test_db)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=use_test_db)
    s = Session()
    s.query(Transaction).delete()
    s.commit()
    yield s
    s.close()


def _tx(**kw):
    base = dict(
        user_id=1, source="manual", merchant="Coto", amount=1000.0,
        date="2026-06-10", month="2026-06", category="necesidades",
        tx_type="expense", status="confirmed",
    )
    base.update(kw)
    return Transaction(**base)


def test_cross_source_duplicate_detected(db):
    db.add(_tx(source="manual", merchant="Coto Sucursal 12"))
    db.commit()
    item = {"source": "mercadopago", "merchant": "Coto", "amount": 1000.0,
            "date": "2026-06-11", "tx_type": "expense"}
    assert find_cross_source_duplicate(db, 1, item) is not None


def test_same_source_not_duplicate(db):
    db.add(_tx(source="mercadopago"))
    db.commit()
    item = {"source": "mercadopago", "merchant": "Coto", "amount": 1000.0,
            "date": "2026-06-10", "tx_type": "expense"}
    assert find_cross_source_duplicate(db, 1, item) is None


def test_different_amount_not_duplicate(db):
    db.add(_tx())
    db.commit()
    item = {"source": "gmail", "merchant": "Coto", "amount": 999.0,
            "date": "2026-06-10", "tx_type": "expense"}
    assert find_cross_source_duplicate(db, 1, item) is None


def test_far_date_not_duplicate(db):
    db.add(_tx())
    db.commit()
    item = {"source": "gmail", "merchant": "Coto", "amount": 1000.0,
            "date": "2026-06-20", "tx_type": "expense"}
    assert find_cross_source_duplicate(db, 1, item) is None


def test_internal_transfer_pair_marked(db):
    db.add(_tx(source="mercadopago", merchant="Transferencia a cuenta propia",
               amount=50000.0, tx_type="expense"))
    db.add(_tx(source="gmail", merchant="Transferencia recibida",
               amount=50000.0, tx_type="income", category="ingreso", date="2026-06-11"))
    db.commit()

    result = mark_duplicates_and_transfers(db, 1, "2026-06")
    assert result["internal_transfers"] == 1
    flagged = db.query(Transaction).filter_by(is_internal_transfer=True).count()
    assert flagged == 2


def test_unrelated_income_expense_not_marked(db):
    db.add(_tx(source="mercadopago", merchant="Carnicería", amount=30000.0))
    db.add(_tx(source="mercadopago", merchant="Sueldo Empresa SA",
               amount=500000.0, tx_type="income", category="ingreso"))
    db.commit()

    result = mark_duplicates_and_transfers(db, 1, "2026-06")
    assert result["internal_transfers"] == 0
