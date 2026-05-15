# tests/test_model_migration.py
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

def test_tx_type_column_exists_after_migration():
    """tx_type column must exist after init_db runs migrations."""
    from app.database import init_db, engine
    init_db()
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("transactions")]
    assert "tx_type" in cols

def test_tx_type_defaults_to_expense():
    """Existing rows without tx_type get 'expense' default."""
    from app.database import init_db, SessionLocal, engine
    init_db()
    with engine.connect() as conn:
        conn.execute(text(
            "INSERT INTO transactions (source, amount, date, month, category) "
            "VALUES ('manual', 100.0, '2026-05-01', '2026-05', 'gustos')"
        ))
        conn.commit()
        row = conn.execute(text(
            "SELECT tx_type FROM transactions ORDER BY id DESC LIMIT 1"
        )).fetchone()
    assert row[0] == "expense"
