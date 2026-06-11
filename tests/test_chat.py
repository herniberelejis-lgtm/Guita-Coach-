# tests/test_chat.py
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
def client_chat():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

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
    user = User(id=1, monthly_income=150000, necesidades_pct=50, gustos_pct=30, ahorro_pct=20)
    db.add(user)
    db.add(Transaction(user_id=1, tx_type="income", amount=150000, category="ingreso",
                       date="2026-05-01", month="2026-05", source="mercadopago", merchant="Sueldo"))
    db.add(Transaction(user_id=1, tx_type="expense", amount=40000, category="necesidades",
                       date="2026-05-05", month="2026-05", source="mercadopago", merchant="Alquiler"))
    db.add(Transaction(user_id=1, tx_type="expense", amount=15000, category="gustos",
                       date="2026-05-06", month="2026-05", source="mercadopago", merchant="Restaurantes"))
    db.commit()
    db.close()
    yield TestClient(app)
    app.dependency_overrides.clear()
    db_mod.engine = _orig_engine
    db_mod.SessionLocal = _orig_session

def test_chat_returns_reply(client_chat):
    resp = client_chat.post("/api/chat", json={
        "message": "Cuanto dinero tengo disponible este mes?",
        "history": []
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert len(data["reply"]) > 5

def test_chat_reply_is_string(client_chat):
    resp = client_chat.post("/api/chat", json={
        "message": "Que deberia hacer con mis ahorros?",
        "history": [
            {"role": "user", "content": "Hola"},
            {"role": "assistant", "content": "Hola, en que te ayudo?"}
        ]
    })
    assert isinstance(resp.json()["reply"], str)

def test_chat_starters_returns_list(client_chat):
    resp = client_chat.get("/api/chat/starters")
    assert resp.status_code == 200
    data = resp.json()
    assert "starters" in data
    assert len(data["starters"]) >= 3
    assert all(isinstance(s, str) for s in data["starters"])
