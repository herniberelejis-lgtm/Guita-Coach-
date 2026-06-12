"""Tests de detección y confirmación de gastos compartidos (vaquitas)."""
import json
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Alert, Base, Transaction
from app.services.splits import (
    confirm_split, detect_split_candidates, expense_amount, reimbursement_map,
)

TODAY = date.today()


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()
    engine.dispose()


def _tx(**kw):
    d = kw.pop("days_ago", 5)
    day = (TODAY - timedelta(days=d)).isoformat()
    base = dict(
        user_id=1, source="mercadopago", merchant="X", amount=1000.0,
        date=day, month=day[:7], category="gustos",
        tx_type="expense", status="confirmed",
    )
    base.update(kw)
    return Transaction(**base)


def _seed_split_pattern(db):
    """Gasto de 90k + 3 transferencias de 20k en los días siguientes."""
    exp = _tx(merchant="Parrilla La Vaca", amount=90000.0, days_ago=6)
    db.add(exp)
    for i in range(3):
        db.add(_tx(merchant=f"Transferencia amigo {i}", amount=20000.0,
                   tx_type="income", category="ingreso", days_ago=5 - i))
    db.commit()
    return exp


def test_detects_split_pattern(db):
    _seed_split_pattern(db)
    created = detect_split_candidates(db, 1)
    assert created == 1
    alert = db.query(Alert).filter_by(type="split_suggestion").first()
    assert alert is not None
    payload = json.loads(alert.payload)
    assert len(payload["income_ids"]) == 3
    assert payload["reimbursed_total"] == 60000.0


def test_detection_is_idempotent(db):
    _seed_split_pattern(db)
    assert detect_split_candidates(db, 1) == 1
    assert detect_split_candidates(db, 1) == 0  # no vuelve a preguntar


def test_small_expense_not_flagged(db):
    db.add(_tx(amount=5000.0, days_ago=6))
    db.add(_tx(amount=2000.0, tx_type="income", category="ingreso", days_ago=5))
    db.add(_tx(amount=2000.0, tx_type="income", category="ingreso", days_ago=4))
    db.commit()
    assert detect_split_candidates(db, 1) == 0


def test_single_income_not_flagged(db):
    db.add(_tx(amount=90000.0, days_ago=6))
    db.add(_tx(amount=20000.0, tx_type="income", category="ingreso", days_ago=5))
    db.commit()
    assert detect_split_candidates(db, 1) == 0


def test_confirm_split_nets_expense(db):
    exp = _seed_split_pattern(db)
    incomes = db.query(Transaction).filter_by(tx_type="income").all()
    result = confirm_split(db, 1, exp.id, [i.id for i in incomes])

    assert result["linked"] == 3
    assert result["reimbursed_total"] == 60000.0
    assert result["net_expense"] == 30000.0

    reimb = reimbursement_map(db, 1)
    assert expense_amount(exp, reimb) == 30000.0
    for i in incomes:
        db.refresh(i)
        assert i.is_reimbursement is True
        assert i.reimburses_tx_id == exp.id
