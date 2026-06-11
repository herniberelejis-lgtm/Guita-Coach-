"""Tests de metas de ahorro y gastos fijos/cuotas."""
import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Goal, RecurringExpense, Transaction, User
from app.services.recurring import apply_recurring, monthly_committed


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    s = sessionmaker(bind=engine)()
    s.add(User(id=1, monthly_income=100000))
    s.commit()
    yield s
    s.close()
    engine.dispose()


def test_recurring_applies_once_per_month(db):
    db.add(RecurringExpense(user_id=1, merchant="Alquiler", amount=200000,
                            category="necesidades", day_of_month=5))
    db.commit()
    today = datetime.date(2026, 6, 11)

    assert apply_recurring(db, 1, today) == 1
    assert apply_recurring(db, 1, today) == 0  # idempotente

    tx = db.query(Transaction).one()
    assert tx.merchant == "Alquiler"
    assert tx.date == "2026-06-05"
    assert tx.source == "recurring"


def test_recurring_waits_for_debit_day(db):
    db.add(RecurringExpense(user_id=1, merchant="Netflix", amount=10000,
                            category="gustos", day_of_month=25))
    db.commit()
    assert apply_recurring(db, 1, datetime.date(2026, 6, 11)) == 0
    assert apply_recurring(db, 1, datetime.date(2026, 6, 25)) == 1


def test_installments_finish_and_deactivate(db):
    db.add(RecurringExpense(user_id=1, merchant="Heladera", amount=50000,
                            category="necesidades", day_of_month=1,
                            installments_total=2))
    db.commit()

    assert apply_recurring(db, 1, datetime.date(2026, 6, 11)) == 1
    assert apply_recurring(db, 1, datetime.date(2026, 7, 11)) == 1
    assert apply_recurring(db, 1, datetime.date(2026, 8, 11)) == 0  # terminó

    item = db.query(RecurringExpense).one()
    assert item.active is False
    assert item.installments_paid == 2
    merchants = [t.merchant for t in db.query(Transaction).all()]
    assert "Heladera (cuota 1/2)" in merchants
    assert "Heladera (cuota 2/2)" in merchants


def test_monthly_committed_sums_active_only(db):
    db.add(RecurringExpense(user_id=1, merchant="A", amount=1000, active=True))
    db.add(RecurringExpense(user_id=1, merchant="B", amount=500, active=False))
    db.commit()
    assert monthly_committed(db, 1) == 1000


def test_subgoal_contribution_rolls_up():
    from fastapi.testclient import TestClient
    engine = create_engine("sqlite:///:memory:",
                           connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)
    s = TestSession()
    s.add(User(id=1, monthly_income=100000, onboarding_done=True))
    s.commit()

    import app.database as db_mod
    from app.main import app
    from app.database import get_db
    from app.security import get_current_user
    _oe, _os = db_mod.engine, db_mod.SessionLocal
    db_mod.engine, db_mod.SessionLocal = engine, TestSession

    def override():
        d = TestSession()
        try:
            yield d
        finally:
            d.close()

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: TestSession().query(User).first()
    try:
        with TestClient(app) as c:
            parent = c.post("/api/goals", json={"name": "Viaje", "target_amount": 1000}).json()
            sub = c.post("/api/goals", json={"name": "Pasajes", "target_amount": 600,
                                             "parent_id": parent["id"]}).json()
            c.post(f"/api/goals/{sub['id']}/contribute", json={"amount": 600})

            goals = c.get("/api/goals").json()
            assert goals[0]["saved_amount"] == 600
            assert goals[0]["subgoals"][0]["is_done"] is True
    finally:
        app.dependency_overrides.clear()
        db_mod.engine, db_mod.SessionLocal = _oe, _os
        engine.dispose()
