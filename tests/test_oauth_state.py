"""El state de OAuth debe sobrevivir a un reinicio del proceso.

Antes, los flujos de conexión (Gmail / Mercado Pago) guardaban el state en un
dict en memoria del módulo. En Railway eso se rompía en cuanto había un
redeploy o más de una instancia: el usuario salía a Google, volvía, y el state
ya no existía → 400 "Estado OAuth inválido" en todos los intentos.
"""
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db

    get_settings.cache_clear()
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "g-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "g-secret")
    monkeypatch.setenv("MP_CLIENT_ID", "mp-id")
    monkeypatch.setenv("MP_CLIENT_SECRET", "mp-secret")
    monkeypatch.setenv("APP_URL", "https://guitacoach.com")

    # base_url https: las cookies de sesión y de state son Secure cuando
    # APP_URL es https, y el cliente las descartaría sobre http.
    with TestClient(app, base_url="https://testserver") as c:
        yield c

    app.dependency_overrides.clear()
    get_settings.cache_clear()


def _register(client):
    r = client.post("/api/auth/register", json={
        "name": "Tester", "email": "t@t.com", "password": "clave12345",
    })
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("path", ["/api/auth/gmail", "/api/auth/mp"])
def test_connect_state_viaja_en_cookie_no_en_memoria(client, path):
    """Iniciar una conexión debe dejar el state en una cookie del browser."""
    _register(client)
    r = client.get(path, follow_redirects=False)
    assert r.status_code == 307, r.text

    state_qs = parse_qs(urlparse(r.headers["location"]).query)["state"][0]
    assert r.cookies.get("oauth_state") == state_qs, (
        "el state debe ir en cookie para sobrevivir redeploys y multi-instancia"
    )

    # No debe quedar estado de proceso: el módulo ya no tiene el dict en memoria.
    import app.routers.auth as auth_mod
    assert not hasattr(auth_mod, "_oauth_states")


@pytest.mark.parametrize("path,expected_host", [
    ("/api/auth/gmail", "accounts.google.com"),
    ("/api/auth/mp", "auth.mercadopago.com"),
    ("/api/auth/google/login", "accounts.google.com"),
    ("/api/auth/mp/login", "auth.mercadopago.com"),
])
def test_redirect_uri_va_url_encoded(client, path, expected_host):
    """El redirect_uri debe ir percent-encoded, no crudo en el query string."""
    _register(client)
    r = client.get(path, follow_redirects=False)
    assert r.status_code == 307, r.text

    loc = r.headers["location"]
    assert urlparse(loc).netloc == expected_host

    # Crudo, "https://..." metería '://' y '/' sin escapar en el query.
    assert "redirect_uri=https%3A%2F%2Fguitacoach.com" in loc, loc
    redirect_uri = parse_qs(urlparse(loc).query)["redirect_uri"][0]
    assert redirect_uri.startswith("https://guitacoach.com/api/auth/")


def test_callback_rechaza_state_que_no_coincide(client):
    """Sin la cookie correcta, el callback no debe aceptar el código."""
    _register(client)
    client.get("/api/auth/gmail", follow_redirects=False)
    r = client.get(
        "/api/auth/gmail/callback?code=abc&state=state-falso",
        follow_redirects=False,
    )
    assert r.status_code == 400
    assert "Estado OAuth inválido" in r.text


@pytest.mark.parametrize("raw", [
    "https://guitacoach.com/",
    "https://guitacoach.com//",
    "  https://guitacoach.com  ",
])
def test_app_url_normaliza_barra_final(monkeypatch, raw):
    """APP_URL con barra al final genera '//' y rompe el redirect_uri."""
    monkeypatch.setenv("APP_URL", raw)
    get_settings.cache_clear()
    try:
        assert get_settings().app_url == "https://guitacoach.com"
    finally:
        get_settings.cache_clear()
