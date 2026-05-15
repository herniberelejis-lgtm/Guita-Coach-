import pytest, datetime
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
                payday=1, name="Test", onboarding_done=True)
    s.add(user)
    for i in range(5):
        s.add(Transaction(user_id=1, tx_type="expense", amount=1000, category="gustos",
                          merchant="Starbucks", date=f"2026-05-0{i+1}", month="2026-05",
                          source="mercadopago", status="classified"))
    s.add(Transaction(user_id=1, tx_type="expense", amount=8000, category="necesidades",
                      merchant="Carrefour", date="2026-05-06", month="2026-05",
                      source="mercadopago", status="classified"))
    s.add(Transaction(user_id=1, tx_type="income", amount=100000, category="ingreso",
                      merchant="Sueldo", date="2026-05-01", month="2026-05",
                      source="mercadopago", status="classified"))
    s.commit()
    yield s
    s.close()
    engine.dispose()


def test_frequent_merchants_present(mem_db):
    from app.routers.insights import month_insights
    from unittest.mock import patch
    with patch("app.routers.insights.date") as mock_date:
        mock_date.today.return_value = datetime.date(2026, 5, 14)
        mock_date.side_effect = lambda *a, **kw: datetime.date(*a, **kw)
        result = month_insights(db=mem_db)
    assert "frequent_merchants" in result
    merchants = result["frequent_merchants"]
    assert any(m["merchant"] == "Starbucks" for m in merchants)
    starbucks = next(m for m in merchants if m["merchant"] == "Starbucks")
    assert starbucks["count"] == 5


def test_total_spent_excludes_income(mem_db):
    from app.routers.insights import month_insights
    from unittest.mock import patch
    with patch("app.routers.insights.date") as mock_date:
        mock_date.today.return_value = datetime.date(2026, 5, 14)
        mock_date.side_effect = lambda *a, **kw: datetime.date(*a, **kw)
        result = month_insights(db=mem_db)
    # 5 * 1000 + 8000 = 13000, NOT 113000 (which would include income)
    assert result["total_spent"] == 13000.0


def test_daily_allowance_present(mem_db):
    from app.routers.insights import month_insights
    from unittest.mock import patch
    with patch("app.routers.insights.date") as mock_date:
        mock_date.today.return_value = datetime.date(2026, 5, 14)
        mock_date.side_effect = lambda *a, **kw: datetime.date(*a, **kw)
        result = month_insights(db=mem_db)
    assert "daily_allowance" in result
    assert result["daily_allowance"] >= 0
