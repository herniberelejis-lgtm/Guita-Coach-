"""Tests for the new investment endpoints: /closed, /timeline, /price-history/{ticker}."""
import pytest
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models import Base, User, Investment, InvestmentTransaction, UserSession


@pytest.fixture
def client():
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
    import app.database as db_mod
    return db_mod.SessionLocal


@pytest.fixture
def authenticated_client(client):
    TestingSession = _get_testing_session(client)
    db = TestingSession()
    user = User(id=1, email="test@example.com", name="Test User")
    db.add(user)
    db.flush()
    session = UserSession(
        user_id=user.id, token="test_token_123",
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    db.close()
    client.cookies.set("gc_session", "test_token_123")
    return client


class TestClosedPositions:
    """GET /api/investments/closed"""

    def test_no_sells_returns_empty(self, authenticated_client):
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        inv = Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            quantity=10.0, avg_cost=150.0, purchase_date=date(2024, 1, 15), status="open",
        )
        db.add(inv)
        db.flush()
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            tx_type="buy", quantity=10.0, price=150.0, date=date(2024, 1, 15),
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/closed")
        assert response.status_code == 200
        assert response.json() == []

    def test_fully_closed_position_detail(self, authenticated_client):
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        inv = Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            currency="ARS", quantity=0.0, avg_cost=0.0,
            purchase_date=date(2024, 1, 15), status="closed",
        )
        db.add(inv)
        db.flush()
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            currency="ARS", asset_type="stock",
            tx_type="buy", quantity=10.0, price=100.0, date=date(2024, 1, 15),
        ))
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            currency="ARS", asset_type="stock",
            tx_type="sell", quantity=10.0, price=120.0, date=date(2024, 2, 1),
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/closed")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        pos = data[0]
        assert pos["ticker"] == "GGAL"
        assert pos["status"] == "closed"
        assert pos["realized_pnl"] == 200.0
        assert pos["total_bought_qty"] == 10.0
        assert pos["total_sold_qty"] == 10.0
        assert pos["avg_buy_price"] == 100.0
        assert pos["avg_sell_price"] == 120.0
        assert pos["first_date"] == "2024-01-15"
        assert pos["last_date"] == "2024-02-01"

    def test_partial_sell_still_open_reported(self, authenticated_client):
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        inv = Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            currency="ARS", quantity=5.0, avg_cost=100.0,
            purchase_date=date(2024, 1, 15), status="open",
        )
        db.add(inv)
        db.flush()
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            currency="ARS", asset_type="stock",
            tx_type="buy", quantity=10.0, price=100.0, date=date(2024, 1, 15),
        ))
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            currency="ARS", asset_type="stock",
            tx_type="sell", quantity=5.0, price=130.0, date=date(2024, 2, 1),
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/closed")
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "open"
        assert data[0]["realized_pnl"] == 150.0

    def test_requires_auth(self, client):
        response = client.get("/api/investments/closed")
        assert response.status_code == 401


class TestTimeline:
    """GET /api/investments/timeline"""

    def test_no_transactions_returns_empty(self, authenticated_client):
        response = authenticated_client.get("/api/investments/timeline")
        assert response.status_code == 200
        data = response.json()
        assert data["points"] == []
        assert data["currency"] == "ARS"

    def test_timeline_includes_cost_basis_and_market_value(self, authenticated_client, monkeypatch):
        async def fake_history(ticker, asset_type, currency, since):
            return [
                {"date": date(2024, 1, 1), "price": 100.0},
                {"date": date(2024, 1, 31), "price": 140.0},
            ]

        from app.services import prices as price_svc
        monkeypatch.setattr(price_svc, "fetch_price_history", fake_history)

        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        inv = Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            currency="ARS", quantity=10.0, avg_cost=100.0,
            purchase_date=date(2024, 1, 1), status="open",
        )
        db.add(inv)
        db.flush()
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            currency="ARS", asset_type="stock",
            tx_type="buy", quantity=10.0, price=100.0, date=date(2024, 1, 1),
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/timeline")
        assert response.status_code == 200
        data = response.json()
        assert len(data["points"]) >= 2
        first, last = data["points"][0], data["points"][-1]
        assert first["cost_basis"] == 1000.0
        assert last["cost_basis"] == 1000.0
        assert last["market_value"] == 1400.0

    def test_requires_auth(self, client):
        response = client.get("/api/investments/timeline")
        assert response.status_code == 401


class TestTickerDetail:
    """GET /api/investments/price-history/{ticker}"""

    def test_unknown_ticker_404(self, authenticated_client):
        response = authenticated_client.get("/api/investments/price-history/ZZZZ")
        assert response.status_code == 404

    def test_returns_history_and_own_transactions(self, authenticated_client, monkeypatch):
        async def fake_history(ticker, asset_type, currency, since):
            assert ticker == "GGAL"
            return [{"date": date(2024, 1, 15), "price": 150.0}]

        from app.services import prices as price_svc
        monkeypatch.setattr(price_svc, "fetch_price_history", fake_history)

        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        inv = Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            currency="ARS", quantity=10.0, avg_cost=150.0,
            purchase_date=date(2024, 1, 15), status="open",
        )
        db.add(inv)
        db.flush()
        db.add(InvestmentTransaction(
            investment_id=inv.id, user_id=1, broker="cocos_capital", ticker="GGAL",
            currency="ARS", asset_type="stock",
            tx_type="buy", quantity=10.0, price=150.0, date=date(2024, 1, 15),
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/price-history/ggal")
        assert response.status_code == 200
        data = response.json()
        assert data["ticker"] == "GGAL"
        assert len(data["price_history"]) == 1
        assert data["price_history"][0]["price"] == 150.0
        assert len(data["transactions"]) == 1
        assert data["transactions"][0]["type"] == "buy"

    def test_requires_auth(self, client):
        response = client.get("/api/investments/price-history/GGAL")
        assert response.status_code == 401


class TestSummaryDiversification:
    """diversification_score field on GET /api/investments/summary"""

    def test_single_holding_score_zero(self, authenticated_client):
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        db.add(Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            currency="ARS", quantity=10.0, avg_cost=100.0,
            purchase_date=date(2024, 1, 15), status="open",
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/summary")
        assert response.json()["diversification_score"] == 0.0

    def test_two_even_holdings_score_100(self, authenticated_client):
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        db.add(Investment(
            user_id=1, broker="cocos_capital", ticker="GGAL", asset_type="stock",
            currency="ARS", quantity=10.0, avg_cost=100.0,
            purchase_date=date(2024, 1, 15), status="open",
        ))
        db.add(Investment(
            user_id=1, broker="cocos_capital", ticker="AL30", asset_type="stock",
            currency="ARS", quantity=10.0, avg_cost=100.0,
            purchase_date=date(2024, 1, 15), status="open",
        ))
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/summary")
        assert abs(response.json()["diversification_score"] - 100.0) < 0.01
