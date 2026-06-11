# tests/test_advisor.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.models import Base, Transaction, User
from app.main import app
from app.database import get_db
from app.security import get_current_user

@pytest.fixture
def client_advisor():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    # Patch db_mod so startup event uses the same engine
    import app.database as db_mod
    _orig_engine = db_mod.engine
    _orig_session = db_mod.SessionLocal
    db_mod.engine = engine
    db_mod.SessionLocal = TestSession

    def override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: TestSession().query(User).first()
    db = TestSession()
    user = User(id=1, monthly_income=100000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20)
    db.add(user)
    for i in range(6):
        db.add(Transaction(user_id=1, tx_type="expense", amount=2000, category="gustos",
                           merchant="Rappi", date=f"2026-05-0{i+1}", month="2026-05",
                           source="mercadopago"))
    db.commit()
    db.close()
    yield TestClient(app)
    app.dependency_overrides.clear()
    db_mod.engine = _orig_engine
    db_mod.SessionLocal = _orig_session

def test_patterns_endpoint_returns_top_merchants(client_advisor):
    resp = client_advisor.get("/api/advisor/patterns?month=2026-05")
    assert resp.status_code == 200
    data = resp.json()
    assert "top_by_frequency" in data
    assert any(m["merchant"] == "Rappi" for m in data["top_by_frequency"])

def test_advice_endpoint_returns_text(client_advisor):
    resp = client_advisor.post("/api/advisor/advice", json={"month": "2026-05", "focus": "gustos"})
    assert resp.status_code == 200
    data = resp.json()
    assert "advice" in data
    assert len(data["advice"]) > 10
