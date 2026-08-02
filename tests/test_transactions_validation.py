"""Valida que /api/transactions rechace montos inválidos en carga manual.

Encontrado en QA: se podía crear un gasto con amount negativo, lo que resta
del total de la franja en vez de sumar (corrompe /api/budget/current)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.models import Base, User


def _client():
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
    prev_engine, prev_session = db_mod.engine, db_mod.SessionLocal
    db_mod.engine, db_mod.SessionLocal = engine, TestSession

    def override():
        d = TestSession()
        try:
            yield d
        finally:
            d.close()

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: TestSession().query(User).first()
    client = TestClient(app)

    def cleanup():
        app.dependency_overrides.clear()
        db_mod.engine, db_mod.SessionLocal = prev_engine, prev_session
        engine.dispose()

    return client, cleanup


def test_manual_transaction_rejects_negative_amount():
    client, cleanup = _client()
    try:
        r = client.post("/api/transactions", json={
            "merchant": "Test", "amount": -500, "date": "2026-08-01", "category": "necesidades",
        })
        assert r.status_code == 422
    finally:
        cleanup()


def test_manual_transaction_rejects_zero_amount():
    client, cleanup = _client()
    try:
        r = client.post("/api/transactions", json={
            "merchant": "Test", "amount": 0, "date": "2026-08-01", "category": "necesidades",
        })
        assert r.status_code == 422
    finally:
        cleanup()


def test_manual_transaction_accepts_positive_amount():
    client, cleanup = _client()
    try:
        r = client.post("/api/transactions", json={
            "merchant": "Test", "amount": 500, "date": "2026-08-01", "category": "necesidades",
        })
        assert r.status_code == 200
        assert r.json()["amount"] == 500.0
    finally:
        cleanup()


def test_manual_transaction_triggers_alert_engine():
    """El endpoint llamaba a run_alert_engine() sin await (coroutine nunca
    ejecutada). Un gasto que supera el 90% de la franja debe generar una
    alerta real, no solo devolver 200."""
    import datetime
    from app.models import Alert

    client, cleanup = _client()
    try:
        today = datetime.date.today().strftime("%Y-%m-%d")
        # Necesidades = 50% de 100000 = 50000 de límite. 46000 = 92%.
        r = client.post("/api/transactions", json={
            "merchant": "Alquiler", "amount": 46000, "date": today, "category": "necesidades",
        })
        assert r.status_code == 200

        import app.database as db_mod
        db = db_mod.SessionLocal()
        try:
            alerts = db.query(Alert).filter_by(user_id=1, category="necesidades").all()
            assert len(alerts) == 1, "run_alert_engine debía crear una alerta de umbral crítico"
            assert alerts[0].severity == "critical"
        finally:
            db.close()
    finally:
        cleanup()
