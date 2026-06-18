"""Test dashboard endpoint — financial and investment metrics."""
import pytest
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models import (
    Base,
    User,
    Transaction,
    Investment,
    InvestmentTransaction,
    InvestmentPrice,
    UserSession,
)


@pytest.fixture
def client():
    """Create FastAPI test client with fresh database."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)

    import app.database as db_mod
    _orig_engine, _orig_session = db_mod.engine, db_mod.SessionLocal
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db_mod.engine = engine
    db_mod.SessionLocal = TestingSession

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, base_url="https://testserver") as c:
        yield c
    app.dependency_overrides.clear()
    db_mod.engine, db_mod.SessionLocal = _orig_engine, _orig_session
    engine.dispose()


def _get_testing_session(client):
    """Helper to get the testing session from the engine."""
    import app.database as db_mod
    return db_mod.SessionLocal


@pytest.fixture
def authenticated_client(client):
    """Create authenticated client with a test user."""
    # Create user and session
    TestingSession = _get_testing_session(client)
    db = TestingSession()
    user = User(
        id=1,
        email="test@example.com",
        name="Test User",
        monthly_income=100000,
        necesidades_pct=50,
        gustos_pct=30,
        ahorro_pct=20,
        payday=1,
        onboarding_done=True,
    )
    db.add(user)
    db.flush()

    # Create valid session
    session = UserSession(
        user_id=user.id,
        token="test_token_123",
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    db.close()

    # Set the session cookie on client
    client.cookies.set("gc_session", "test_token_123")
    return client


class TestDashboard:
    """Test GET /api/insights/dashboard endpoint."""

    def test_dashboard_without_investments(self, authenticated_client):
        """Test dashboard without any investments returns investment data with 0 values."""
        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        # Check basic fields
        assert "month" in data
        assert "income" in data
        assert "total_spent" in data
        assert "total_budget" in data
        assert "days_remaining" in data

        # Check investments key exists
        assert "investments" in data
        investments = data["investments"]

        # Should have 0 values when no investments
        assert investments["total_invested"] == 0.0
        assert investments["total_current_value"] == 0.0
        assert investments["total_pnl"] == 0.0

    def test_dashboard_with_open_investment(self, authenticated_client):
        """Test dashboard with an open investment includes investment summary."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create investment with price
        inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            quantity=10.0,
            avg_cost=150.0,
            purchase_date=date(2024, 1, 15),
            status="open",
        )
        price = InvestmentPrice(ticker="GGAL", price=160.0, currency="ARS")
        db.add(inv)
        db.add(price)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        # Check investments in response
        investments = data["investments"]
        assert investments["total_invested"] == 1500.0  # 10 * 150
        assert investments["total_current_value"] == 1600.0  # 10 * 160
        assert investments["total_pnl"] == 100.0  # unrealized gain

    def test_dashboard_with_multiple_investments(self, authenticated_client):
        """Test dashboard with multiple open investments."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create two investments
        inv1 = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            quantity=10.0,
            avg_cost=150.0,
            purchase_date=date(2024, 1, 15),
            status="open",
        )
        inv2 = Investment(
            user_id=1,
            broker="invertir_online",
            ticker="FRESCX",
            quantity=5.0,
            avg_cost=100.0,
            purchase_date=date(2024, 2, 1),
            status="open",
        )

        # Add prices
        price1 = InvestmentPrice(ticker="GGAL", price=160.0, currency="ARS")
        price2 = InvestmentPrice(ticker="FRESCX", price=110.0, currency="ARS")

        db.add(inv1)
        db.add(inv2)
        db.add(price1)
        db.add(price2)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        investments = data["investments"]
        # Total invested: (10 * 150) + (5 * 100) = 2000
        assert investments["total_invested"] == 2000.0
        # Total current value: (10 * 160) + (5 * 110) = 2150
        assert investments["total_current_value"] == 2150.0
        # Total P&L: 2150 - 2000 = 150
        assert investments["total_pnl"] == 150.0

    def test_dashboard_with_closed_position(self, authenticated_client):
        """Test dashboard includes realized P&L from closed positions."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create closed investment
        inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            quantity=0.0,
            avg_cost=150.0,
            purchase_date=date(2024, 1, 15),
            status="closed",
        )
        db.add(inv)
        db.flush()

        # Create buy and sell transactions
        buy_tx = InvestmentTransaction(
            investment_id=inv.id,
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            tx_type="buy",
            quantity=10.0,
            price=150.0,
            date=date(2024, 1, 15),
        )
        sell_tx = InvestmentTransaction(
            investment_id=inv.id,
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            tx_type="sell",
            quantity=10.0,
            price=160.0,
            date=date(2024, 2, 1),
        )
        db.add(buy_tx)
        db.add(sell_tx)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        investments = data["investments"]
        # No open positions
        assert investments["total_invested"] == 0.0
        assert investments["total_current_value"] == 0.0
        # But realized P&L should be 100 (sell 1600 - buy 1500)
        assert investments["total_pnl"] == 100.0

    def test_dashboard_with_mixed_positions(self, authenticated_client):
        """Test dashboard with both open and closed positions."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Open position
        open_inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            quantity=10.0,
            avg_cost=150.0,
            purchase_date=date(2024, 1, 15),
            status="open",
        )
        open_price = InvestmentPrice(ticker="GGAL", price=160.0, currency="ARS")

        # Closed position
        closed_inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="FRESCX",
            quantity=0.0,
            avg_cost=100.0,
            purchase_date=date(2024, 1, 1),
            status="closed",
        )

        db.add(open_inv)
        db.add(open_price)
        db.add(closed_inv)
        db.flush()

        # Transactions for closed position
        buy_tx = InvestmentTransaction(
            investment_id=closed_inv.id,
            user_id=1,
            broker="cocos_capital",
            ticker="FRESCX",
            tx_type="buy",
            quantity=5.0,
            price=100.0,
            date=date(2024, 1, 1),
        )
        sell_tx = InvestmentTransaction(
            investment_id=closed_inv.id,
            user_id=1,
            broker="cocos_capital",
            ticker="FRESCX",
            tx_type="sell",
            quantity=5.0,
            price=110.0,
            date=date(2024, 2, 1),
        )
        db.add(buy_tx)
        db.add(sell_tx)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        investments = data["investments"]
        # Open position: 10 * 150 = 1500 invested, 10 * 160 = 1600 current
        assert investments["total_invested"] == 1500.0
        assert investments["total_current_value"] == 1600.0
        # Total P&L: unrealized (100) + realized (50) = 150
        assert investments["total_pnl"] == 150.0

    def test_dashboard_with_expenses(self, authenticated_client):
        """Test dashboard includes current month expenses."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Add some expenses for the current month
        today = date.today()
        month = today.strftime("%Y-%m")

        tx1 = Transaction(
            user_id=1,
            tx_type="expense",
            amount=5000,
            category="gustos",
            merchant="Starbucks",
            date=str(today),
            month=month,
            source="mercadopago",
            status="classified",
        )
        tx2 = Transaction(
            user_id=1,
            tx_type="expense",
            amount=10000,
            category="necesidades",
            merchant="Carrefour",
            date=str(today),
            month=month,
            source="mercadopago",
            status="classified",
        )
        db.add(tx1)
        db.add(tx2)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        # Check expenses are included
        assert data["total_spent"] == 15000.0
        assert data["income"] == 100000  # from user.monthly_income

    def test_dashboard_investments_no_price(self, authenticated_client):
        """Test dashboard with investment that has no price defaults to 0."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create investment without price
        inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            quantity=10.0,
            avg_cost=150.0,
            purchase_date=date(2024, 1, 15),
            status="open",
        )
        db.add(inv)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        investments = data["investments"]
        # With no price, current_price defaults to 0
        assert investments["total_invested"] == 1500.0  # 10 * 150
        assert investments["total_current_value"] == 0.0  # 10 * 0
        assert investments["total_pnl"] == -1500.0  # 0 - 1500

    def test_dashboard_unauthenticated(self, client):
        """Test dashboard without authentication returns 401."""
        response = client.get("/api/insights/dashboard")
        assert response.status_code == 401

    def test_dashboard_required_fields(self, authenticated_client):
        """Test dashboard returns all required fields."""
        response = authenticated_client.get("/api/insights/dashboard")

        assert response.status_code == 200
        data = response.json()

        # All required fields
        required_fields = [
            "month",
            "income",
            "total_spent",
            "total_budget",
            "days_remaining",
            "investments",
        ]

        for field in required_fields:
            assert field in data, f"Missing field: {field}"

        # All required investment fields
        investments = data["investments"]
        investment_fields = ["total_invested", "total_current_value", "total_pnl"]

        for field in investment_fields:
            assert field in investments, f"Missing investment field: {field}"
