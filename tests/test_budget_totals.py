import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, Transaction, User

@pytest.fixture
def mem_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    user = User(id=1, monthly_income=100000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20,
                onboarding_done=True, payday=1, name="Test")
    s.add(user)
    s.add(Transaction(user_id=1, tx_type="income", amount=100000, category="ingreso",
                      date="2026-05-01", month="2026-05", source="mercadopago",
                      merchant="Sueldo", status="classified"))
    s.add(Transaction(user_id=1, tx_type="expense", amount=20000, category="necesidades",
                      date="2026-05-02", month="2026-05", source="mercadopago",
                      merchant="Supermercado", status="classified"))
    s.add(Transaction(user_id=1, tx_type="expense", amount=5000, category="gustos",
                      date="2026-05-03", month="2026-05", source="mercadopago",
                      merchant="Netflix", status="classified", needs_review=True))
    s.commit()
    yield s
    s.close()
    engine.dispose()


def test_franja_data_only_counts_expenses(mem_db):
    """Income transactions must NOT inflate franja spending."""
    from app.routers.budget import _franja_data
    txs = mem_db.query(Transaction).all()
    data = _franja_data(mem_db.query(User).first(), txs, "2026-05")
    nec = next(f for f in data["franjas"] if f["name"] == "necesidades")
    assert nec["spent"] == 20000.0, "Only expense txs should count"
    gus = next(f for f in data["franjas"] if f["name"] == "gustos")
    assert gus["spent"] == 5000.0


def test_budget_totals_fields(mem_db):
    """get_current_budget must return total_income, total_expenses, balance, pending_count."""
    import datetime
    from unittest.mock import patch
    from app.routers.budget import get_current_budget

    with patch("app.routers.budget.date") as mock_date:
        mock_date.today.return_value = datetime.date(2026, 5, 14)
        mock_date.side_effect = lambda *args, **kw: datetime.date(*args, **kw)
        result = get_current_budget(db=mem_db)

    assert result["total_income"] == 100000.0
    assert result["total_expenses"] == 25000.0
    assert result["balance"] == 75000.0
    assert result["pending_count"] == 1


def test_franja_daily_allowance_present(mem_db):
    """Each franja must include daily_allowance."""
    from app.routers.budget import _franja_data
    txs = mem_db.query(Transaction).all()
    data = _franja_data(mem_db.query(User).first(), txs, "2026-05", days_remaining=17)
    for franja in data["franjas"]:
        assert "daily_allowance" in franja
        assert franja["daily_allowance"] >= 0
