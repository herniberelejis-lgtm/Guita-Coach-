import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from .models import Base
from .config import get_settings

# Vercel (y cualquier runtime serverless) expone esta variable. El disco es de
# sólo lectura salvo /tmp, y /tmp es efímero y distinto por instancia.
IS_SERVERLESS = bool(os.environ.get("VERCEL"))


def _resolve_database_url() -> str:
    url = get_settings().database_url or "sqlite:///./guita.db"
    # Railway/Heroku exponen postgres:// pero SQLAlchemy 2.x requiere postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


DATABASE_URL = _resolve_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SERVERLESS and IS_SQLITE:
    # Fallar acá con un mensaje claro en vez de morir más adelante con
    # "attempt to write a readonly database", que no dice nada.
    raise RuntimeError(
        "DATABASE_URL no está seteada. En serverless no se puede usar SQLite: "
        "el disco es de sólo lectura y se borra en cada invocación. "
        "Creá un Postgres (Neon, Supabase) y seteá DATABASE_URL."
    )

if IS_SQLITE:
    _engine_kwargs = {"connect_args": {"check_same_thread": False}}
elif IS_SERVERLESS:
    # Cada instancia levanta su propio pool y se congela sin cerrarlo, así que
    # un pool normal agota las conexiones del Postgres. NullPool abre y cierra
    # por request; el pooling real lo hace el endpoint pooled del proveedor.
    _engine_kwargs = {"poolclass": NullPool, "pool_pre_ping": True}
else:
    _engine_kwargs = {"pool_pre_ping": True}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def _run_migrations():
    """Applies additive migrations safely (idempotent, SQLite + Postgres)."""
    migrations = [
        "ALTER TABLE transactions ADD COLUMN tx_type VARCHAR DEFAULT 'expense'",
        "ALTER TABLE transactions ADD COLUMN is_internal_transfer BOOLEAN DEFAULT FALSE",
        "ALTER TABLE transactions ADD COLUMN is_duplicate BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN email VARCHAR",
        "ALTER TABLE users ADD COLUMN password_hash VARCHAR",
        "ALTER TABLE transactions ADD COLUMN is_reimbursement BOOLEAN DEFAULT FALSE",
        "ALTER TABLE transactions ADD COLUMN reimburses_tx_id INTEGER",
        "ALTER TABLE alerts ADD COLUMN payload TEXT",
        "ALTER TABLE transactions ADD COLUMN payment_method VARCHAR DEFAULT ''",
        "ALTER TABLE users ADD COLUMN income_is_variable BOOLEAN DEFAULT FALSE",
        "ALTER TABLE investment ADD COLUMN asset_type VARCHAR DEFAULT 'stock'",
        "ALTER TABLE investment ADD COLUMN currency VARCHAR DEFAULT 'ARS'",
        "ALTER TABLE investment_transaction ADD COLUMN asset_type VARCHAR DEFAULT 'stock'",
        "ALTER TABLE investment_transaction ADD COLUMN currency VARCHAR DEFAULT 'ARS'",
        "ALTER TABLE investment_price ADD COLUMN asset_type VARCHAR DEFAULT 'stock'",
        "ALTER TABLE users ADD COLUMN balance FLOAT DEFAULT 0.0",
    ]
    if _schema_is_current(migrations):
        return

    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                msg = str(e).lower()
                if "duplicate column" not in msg and "already exists" not in msg:
                    raise
                conn.rollback()


def _schema_is_current(migrations: list[str]) -> bool:
    """¿Ya está aplicada la última migración?

    Las migraciones son aditivas y en orden, así que si existe la columna de la
    última, existen todas. Sirve para no disparar 16 ALTER TABLE que fallan en
    cada arranque: en serverless eso es un cold start entero de latencia contra
    una base remota, y varias instancias arrancando a la vez corren el mismo DDL.
    """
    from sqlalchemy import inspect

    parts = migrations[-1].split()
    table, column = parts[2], parts[5]
    try:
        cols = inspect(engine).get_columns(table)
    except Exception:
        return False  # la tabla no existe todavía: hay que migrar
    return any(c["name"] == column for c in cols)


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
