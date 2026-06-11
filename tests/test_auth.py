"""Tests de registro, login y sesiones."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base
from app.security import hash_password, verify_password


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    from app.main import app
    from app.database import get_db
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


def test_password_hash_roundtrip():
    h = hash_password("secreta123")
    assert verify_password("secreta123", h)
    assert not verify_password("otra", h)
    assert not verify_password("secreta123", "basura")


def test_register_login_me_logout(client):
    r = client.post("/api/auth/register", json={
        "name": "Hernán", "email": "h@test.com", "password": "secreta123",
    })
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "h@test.com"
    assert "gc_session" in r.cookies

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["name"] == "Hernán"

    r = client.post("/api/auth/logout")
    assert r.status_code == 200

    r = client.post("/api/auth/login", json={"email": "h@test.com", "password": "secreta123"})
    assert r.status_code == 200


def test_register_duplicate_email(client):
    payload = {"name": "A", "email": "dup@test.com", "password": "secreta123"}
    assert client.post("/api/auth/register", json=payload).status_code == 200
    assert client.post("/api/auth/register", json=payload).status_code == 409


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={
        "name": "B", "email": "b@test.com", "password": "secreta123",
    })
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"email": "b@test.com", "password": "incorrecta"})
    assert r.status_code == 401


def test_short_password_rejected(client):
    r = client.post("/api/auth/register", json={
        "name": "C", "email": "c@test.com", "password": "corta",
    })
    assert r.status_code == 422
