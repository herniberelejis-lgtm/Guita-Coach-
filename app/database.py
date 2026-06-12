from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .models import Base

DATABASE_URL = "sqlite:///./guita.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def _run_migrations():
    """Applies additive SQLite migrations safely (idempotent)."""
    migrations = [
        "ALTER TABLE transactions ADD COLUMN tx_type VARCHAR DEFAULT 'expense'",
        "ALTER TABLE transactions ADD COLUMN is_internal_transfer BOOLEAN DEFAULT 0",
        "ALTER TABLE transactions ADD COLUMN is_duplicate BOOLEAN DEFAULT 0",
        "ALTER TABLE users ADD COLUMN email VARCHAR",
        "ALTER TABLE users ADD COLUMN password_hash VARCHAR",
        "ALTER TABLE transactions ADD COLUMN is_reimbursement BOOLEAN DEFAULT 0",
        "ALTER TABLE transactions ADD COLUMN reimburses_tx_id INTEGER",
        "ALTER TABLE alerts ADD COLUMN payload TEXT",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                msg = str(e).lower()
                if "duplicate column" not in msg and "already exists" not in msg:
                    raise

def init_db():
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    from .config import get_settings
    if get_settings().demo_mode:
        _ensure_user()
        _ensure_connections()

def _ensure_user():
    db = SessionLocal()
    from .models import User
    if not db.query(User).first():
        db.add(User(id=1))
        db.commit()
    db.close()

def _ensure_connections():
    db = SessionLocal()
    from .models import Connection
    for provider in ("gmail", "mercadopago"):
        if not db.query(Connection).filter_by(provider=provider).first():
            db.add(Connection(user_id=1, provider=provider))
    db.commit()
    db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
