"""Test Academy content endpoint and profile-based prioritization."""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models import Base, User, Investment, UserSession
from app.routers.academy import _build_profile, _score


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


def _login(client, **user_kwargs):
    import app.database as db_mod
    db = db_mod.SessionLocal()
    user = User(id=1, email="test@example.com", name="Test", **user_kwargs)
    db.add(user)
    db.flush()
    db.add(UserSession(user_id=user.id, token="tok123", expires_at=datetime.utcnow() + timedelta(days=30)))
    db.commit()
    db.close()
    client.cookies.set("gc_session", "tok123")
    return client


class TestProfileScoring:
    def test_beginner_with_no_investments(self):
        user = User(ahorro_pct=20, income_is_variable=False)
        profile = _build_profile(user, [])
        assert profile["is_beginner"] is True
        assert profile["diversified"] is False

    def test_crypto_only_flags_crypto_only_and_not_diversified(self):
        user = User(ahorro_pct=20, income_is_variable=False)
        invs = [Investment(asset_type="crypto"), Investment(asset_type="crypto")]
        profile = _build_profile(user, invs)
        assert profile["crypto_only"] is True
        assert profile["diversified"] is False

    def test_diversified_when_two_asset_types(self):
        user = User(ahorro_pct=20, income_is_variable=False)
        invs = [Investment(asset_type="crypto"), Investment(asset_type="stock")]
        profile = _build_profile(user, invs)
        assert profile["diversified"] is True
        assert profile["crypto_only"] is False

    def test_low_buffer_below_10_pct_ahorro(self):
        user = User(ahorro_pct=5, income_is_variable=False)
        profile = _build_profile(user, [])
        assert profile["low_buffer"] is True

    def test_score_counts_matching_tags(self):
        profile = {"is_beginner": True, "low_buffer": True, "diversified": False}
        topic = {"tags": ["is_beginner", "low_buffer", "diversified"]}
        assert _score(topic, profile) == 2


class TestAcademyEndpoint:
    def test_requires_auth(self, client):
        response = client.get("/api/academy")
        assert response.status_code == 401

    def test_beginner_gets_primeros_pasos_recommended(self, client):
        _login(client, ahorro_pct=20, income_is_variable=False)
        response = client.get("/api/academy")
        assert response.status_code == 200
        data = response.json()
        ids = [t["id"] for t in data["recommended"]]
        assert "que-es-invertir" in ids
        assert "primer-portafolio" in ids

    def test_low_buffer_recommends_fondo_emergencia(self, client):
        _login(client, ahorro_pct=2, income_is_variable=False)
        response = client.get("/api/academy")
        data = response.json()
        ids = [t["id"] for t in data["recommended"]]
        assert "fondo-emergencia" in ids

    def test_variable_income_recommends_ingreso_variable_topic(self, client):
        _login(client, ahorro_pct=20, income_is_variable=True)
        response = client.get("/api/academy")
        data = response.json()
        ids = [t["id"] for t in data["recommended"]]
        assert "ingreso-variable" in ids

    def test_categories_cover_all_topics(self, client):
        _login(client, ahorro_pct=20, income_is_variable=False)
        response = client.get("/api/academy")
        data = response.json()
        total = sum(len(c["topics"]) for c in data["categories"])
        from app.services.academy_content import TOPICS
        assert total == len(TOPICS)
