"""Test investment API endpoints."""
import pytest
from io import BytesIO
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models import Base, User, Investment, InvestmentTransaction, InvestmentPrice, UserSession


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
    user = User(id=1, email="test@example.com", name="Test User")
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


class TestUploadCSV:
    """Test POST /api/investments/upload endpoint."""

    def test_upload_csv_valid_cocos(self, authenticated_client):
        """Test uploading a valid Cocos Capital CSV."""
        csv_content = (
            "Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total\n"
            "2024-01-15,Compra,GGAL,10,150.50,50,1555.00\n"
        ).encode()

        response = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["broker"] == "cocos_capital"
        assert data["fetched"] == 1
        assert data["saved"] == 1

    def test_upload_csv_invalid_format(self, authenticated_client):
        """Test uploading a CSV with unrecognized format."""
        csv_content = "invalid,format\n1,2\n".encode()

        response = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )

        assert response.status_code == 400
        assert "not recognized" in response.json()["detail"]

    def test_upload_non_csv_file(self, authenticated_client):
        """Test uploading a non-CSV file."""
        content = b"not a csv"

        response = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.txt", BytesIO(content), "text/plain")},
        )

        assert response.status_code == 400
        assert "CSV" in response.json()["detail"]

    def test_upload_file_too_large(self, authenticated_client):
        """Test uploading a file larger than 5MB."""
        # Create a 6MB file
        large_content = b"x" * (6 * 1024 * 1024)

        response = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(large_content), "text/csv")},
        )

        assert response.status_code == 413
        assert "too large" in response.json()["detail"]

    def test_upload_csv_duplicate_transactions_skipped(self, authenticated_client):
        """Test that duplicate transactions are silently skipped."""
        csv_content = (
            "Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total\n"
            "2024-01-15,Compra,GGAL,10,150.50,50,1555.00\n"
        ).encode()

        # Upload first time
        response1 = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )
        assert response1.json()["saved"] == 1

        # Upload same CSV again
        response2 = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )
        assert response2.json()["saved"] == 0  # Duplicates skipped

    def test_upload_unauthenticated(self, client):
        """Test uploading without authentication returns 401."""
        csv_content = (
            "Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total\n"
            "2024-01-15,Compra,GGAL,10,150.50,50,1555.00\n"
        ).encode()

        response = client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )

        assert response.status_code == 401


class TestGetHoldings:
    """Test GET /api/investments/holdings endpoint."""

    def test_get_holdings_empty(self, authenticated_client):
        """Test getting holdings when no investments exist."""
        response = authenticated_client.get("/api/investments/holdings")

        assert response.status_code == 200
        assert response.json() == []

    def test_get_holdings_with_data(self, authenticated_client):
        """Test getting holdings with open positions."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create an investment
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

        # Create a price record
        price = InvestmentPrice(ticker="GGAL", price=160.0, currency="ARS")
        db.add(price)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/holdings")

        assert response.status_code == 200
        holdings = response.json()
        assert len(holdings) == 1
        assert holdings[0]["ticker"] == "GGAL"
        assert holdings[0]["quantity"] == 10.0
        assert holdings[0]["avg_cost"] == 150.0
        assert holdings[0]["current_price"] == 160.0
        assert holdings[0]["pnl"] == 100.0  # (160 - 150) * 10
        assert abs(holdings[0]["pnl_percent"] - 6.67) < 0.1

    def test_get_holdings_no_price(self, authenticated_client):
        """Test getting holdings when price is not set."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create an investment without price
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

        response = authenticated_client.get("/api/investments/holdings")

        assert response.status_code == 200
        holdings = response.json()
        assert len(holdings) == 1
        assert holdings[0]["current_price"] == 0.0

    def test_get_holdings_closed_positions_excluded(self, authenticated_client):
        """Test that closed positions are not included in holdings."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create open and closed investments
        open_inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            quantity=10.0,
            avg_cost=150.0,
            purchase_date=date(2024, 1, 15),
            status="open",
        )
        closed_inv = Investment(
            user_id=1,
            broker="cocos_capital",
            ticker="FRESCX",
            quantity=0.0,
            avg_cost=0.0,
            purchase_date=date(2024, 1, 15),
            status="closed",
        )
        db.add(open_inv)
        db.add(closed_inv)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/holdings")

        assert response.status_code == 200
        holdings = response.json()
        assert len(holdings) == 1
        assert holdings[0]["ticker"] == "GGAL"

    def test_get_holdings_unauthenticated(self, client):
        """Test getting holdings without authentication returns 401."""
        response = client.get("/api/investments/holdings")
        assert response.status_code == 401


class TestGetHistory:
    """Test GET /api/investments/history endpoint."""

    def test_get_history_empty(self, authenticated_client):
        """Test getting history when no transactions exist."""
        response = authenticated_client.get("/api/investments/history")

        assert response.status_code == 200
        assert response.json() == []

    def test_get_history_with_data(self, authenticated_client):
        """Test getting transaction history."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create transactions
        tx1 = InvestmentTransaction(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            tx_type="buy",
            quantity=10.0,
            price=150.0,
            date=date(2024, 1, 15),
        )
        tx2 = InvestmentTransaction(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            tx_type="sell",
            quantity=5.0,
            price=160.0,
            date=date(2024, 2, 1),
        )
        db.add(tx1)
        db.add(tx2)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/history")

        assert response.status_code == 200
        history = response.json()
        assert len(history) == 2
        # Should be sorted by date descending
        assert history[0]["date"] == "2024-02-01"
        assert history[1]["date"] == "2024-01-15"
        assert history[0]["type"] == "sell"
        assert history[1]["type"] == "buy"

    def test_get_history_totals(self, authenticated_client):
        """Test that history items have correct total."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        tx = InvestmentTransaction(
            user_id=1,
            broker="cocos_capital",
            ticker="GGAL",
            tx_type="buy",
            quantity=10.0,
            price=150.0,
            date=date(2024, 1, 15),
        )
        db.add(tx)
        db.commit()
        db.close()

        response = authenticated_client.get("/api/investments/history")

        assert response.status_code == 200
        history = response.json()
        assert len(history) == 1
        assert history[0]["total"] == 1500.0  # 10 * 150

    def test_get_history_unauthenticated(self, client):
        """Test getting history without authentication returns 401."""
        response = client.get("/api/investments/history")
        assert response.status_code == 401


class TestGetSummary:
    """Test GET /api/investments/summary endpoint."""

    def test_get_summary_empty(self, authenticated_client):
        """Test getting summary when no investments exist."""
        response = authenticated_client.get("/api/investments/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_invested"] == 0.0
        assert data["total_current_value"] == 0.0
        assert data["total_unrealized"] == 0.0
        assert data["realized_pnl"] == 0.0
        assert data["total_pnl"] == 0.0

    def test_get_summary_with_open_position(self, authenticated_client):
        """Test summary with an open position."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create investment and price
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

        response = authenticated_client.get("/api/investments/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_invested"] == 1500.0  # 10 * 150
        assert data["total_current_value"] == 1600.0  # 10 * 160
        assert data["total_unrealized"] == 100.0  # 1600 - 1500
        assert data["realized_pnl"] == 0.0
        assert data["total_pnl"] == 100.0

    def test_get_summary_with_closed_position(self, authenticated_client):
        """Test summary with realized P&L from closed position."""
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

        response = authenticated_client.get("/api/investments/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total_invested"] == 0.0  # No open positions
        assert data["total_unrealized"] == 0.0
        assert data["realized_pnl"] == 100.0  # (10*160) - (10*150)
        assert data["total_pnl"] == 100.0

    def test_get_summary_unauthenticated(self, client):
        """Test getting summary without authentication returns 401."""
        response = client.get("/api/investments/summary")
        assert response.status_code == 401


class TestUpdatePrice:
    """Test POST /api/investments/price endpoint."""

    def test_update_price_new_ticker(self, authenticated_client):
        """Test updating price for a new ticker."""
        response = authenticated_client.post(
            "/api/investments/price",
            json={"ticker": "GGAL", "price": 155.50, "currency": "ARS"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["ticker"] == "GGAL"
        assert data["price"] == 155.50

        # Verify it was saved
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        price_record = db.query(InvestmentPrice).filter_by(ticker="GGAL").first()
        assert price_record is not None
        assert price_record.price == 155.50
        assert price_record.currency == "ARS"
        db.close()

    def test_update_price_existing_ticker(self, authenticated_client):
        """Test updating price for an existing ticker."""
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()

        # Create initial price
        price = InvestmentPrice(ticker="GGAL", price=150.0, currency="ARS")
        db.add(price)
        db.commit()
        db.close()

        # Update price
        response = authenticated_client.post(
            "/api/investments/price",
            json={"ticker": "GGAL", "price": 160.0, "currency": "ARS"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["price"] == 160.0

        # Verify update
        db = TestingSession()
        price_record = db.query(InvestmentPrice).filter_by(ticker="GGAL").first()
        assert price_record.price == 160.0
        db.close()

    def test_update_price_default_currency(self, authenticated_client):
        """Test that currency defaults to ARS."""
        response = authenticated_client.post(
            "/api/investments/price",
            json={"ticker": "GGAL", "price": 155.50},
        )

        assert response.status_code == 200

        # Verify default currency
        TestingSession = _get_testing_session(authenticated_client)
        db = TestingSession()
        price_record = db.query(InvestmentPrice).filter_by(ticker="GGAL").first()
        assert price_record.currency == "ARS"
        db.close()

    def test_update_price_unauthenticated(self, client):
        """Test updating price without authentication returns 401."""
        response = client.post(
            "/api/investments/price",
            json={"ticker": "GGAL", "price": 155.50},
        )
        assert response.status_code == 401


class TestIntegration:
    """Integration tests for complete investment workflows."""

    def test_upload_then_holdings_then_summary_flow(self, authenticated_client):
        """Test complete flow: upload CSV -> get holdings -> update price -> get summary."""
        # 1. Upload CSV
        csv_content = (
            "Fecha,Tipo,Especie,Cantidad,Precio,Comision,Total\n"
            "2024-01-15,Compra,GGAL,10,150.50,50,1555.00\n"
        ).encode()

        response = authenticated_client.post(
            "/api/investments/upload",
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["saved"] == 1

        # 2. Check holdings (before price update)
        response = authenticated_client.get("/api/investments/holdings")
        assert response.status_code == 200
        holdings = response.json()
        assert len(holdings) == 1
        assert holdings[0]["ticker"] == "GGAL"
        assert holdings[0]["current_price"] == 0.0

        # 3. Update price
        response = authenticated_client.post(
            "/api/investments/price",
            json={"ticker": "GGAL", "price": 160.0, "currency": "ARS"},
        )
        assert response.status_code == 200

        # 4. Check holdings again (with price)
        response = authenticated_client.get("/api/investments/holdings")
        assert response.status_code == 200
        holdings = response.json()
        assert holdings[0]["current_price"] == 160.0
        assert abs(holdings[0]["pnl"] - 94.9) < 0.1  # (160 - 150.50) * 10

        # 5. Check summary
        response = authenticated_client.get("/api/investments/summary")
        assert response.status_code == 200
        summary = response.json()
        assert abs(summary["total_invested"] - 1505.0) < 0.1  # 10 * 150.50
        assert summary["total_current_value"] == 1600.0  # 10 * 160
        assert abs(summary["total_unrealized"] - 95.0) < 0.1

        # 6. Check history
        response = authenticated_client.get("/api/investments/history")
        assert response.status_code == 200
        history = response.json()
        assert len(history) == 1
        assert history[0]["ticker"] == "GGAL"
        assert history[0]["type"] == "buy"
