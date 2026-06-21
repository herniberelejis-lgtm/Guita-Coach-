import os
# Desactiva el fetch de precios en tiempo real durante los tests (sin red, deterministico)
os.environ["LIVE_PRICES"] = "false"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="session", autouse=True)
def use_test_db():
    from app.config import get_settings
    get_settings.cache_clear()
    """Patch the app database to use an in-memory SQLite for all tests."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    import app.database as db_mod
    db_mod.engine = test_engine
    # Patch SessionLocal too
    db_mod.SessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=test_engine
    )
    yield test_engine
