import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture(scope="session", autouse=True)
def use_test_db():
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
