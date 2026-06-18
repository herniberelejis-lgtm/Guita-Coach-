"""Verify that investment models are properly defined and tables can be created."""
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from app.models import Base, Investment, InvestmentTransaction, InvestmentPrice


@pytest.fixture
def test_engine():
    """Create a test database engine in memory."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return engine


def test_investment_models_importable():
    """Verify all investment models can be imported."""
    assert Investment is not None
    assert InvestmentTransaction is not None
    assert InvestmentPrice is not None


def test_investment_models_have_tablenames():
    """Verify all investment models have __tablename__ attributes."""
    assert hasattr(Investment, "__tablename__")
    assert Investment.__tablename__ == "investment"

    assert hasattr(InvestmentTransaction, "__tablename__")
    assert InvestmentTransaction.__tablename__ == "investment_transaction"

    assert hasattr(InvestmentPrice, "__tablename__")
    assert InvestmentPrice.__tablename__ == "investment_price"


def test_investment_table_created(test_engine):
    """Verify the investment table is created with correct columns."""
    inspector = inspect(test_engine)
    tables = inspector.get_table_names()
    assert "investment" in tables

    columns = {col["name"] for col in inspector.get_columns("investment")}
    expected_columns = {
        "id", "user_id", "broker", "ticker", "quantity", "avg_cost",
        "purchase_date", "status", "created_at", "updated_at"
    }
    assert expected_columns.issubset(columns)


def test_investment_transaction_table_created(test_engine):
    """Verify the investment_transaction table is created with correct columns."""
    inspector = inspect(test_engine)
    tables = inspector.get_table_names()
    assert "investment_transaction" in tables

    columns = {col["name"] for col in inspector.get_columns("investment_transaction")}
    expected_columns = {
        "id", "investment_id", "user_id", "broker", "ticker", "tx_type",
        "quantity", "price", "date", "csv_reference", "linked_transaction_id", "created_at"
    }
    assert expected_columns.issubset(columns)


def test_investment_price_table_created(test_engine):
    """Verify the investment_price table is created with correct columns."""
    inspector = inspect(test_engine)
    tables = inspector.get_table_names()
    assert "investment_price" in tables

    columns = {col["name"] for col in inspector.get_columns("investment_price")}
    expected_columns = {"id", "ticker", "price", "currency", "last_updated"}
    assert expected_columns.issubset(columns)


def test_investment_user_relationship(test_engine):
    """Verify Investment model has correct relationship to User."""
    assert hasattr(Investment, "user")
    assert hasattr(Investment, "transactions")


def test_investment_transaction_relationships(test_engine):
    """Verify InvestmentTransaction model has correct relationships."""
    assert hasattr(InvestmentTransaction, "investment")
    assert hasattr(InvestmentTransaction, "user")


def test_base_metadata_includes_investment_tables():
    """Verify Base.metadata includes all investment tables."""
    table_names = {table.name for table in Base.metadata.tables.values()}
    assert "investment" in table_names
    assert "investment_transaction" in table_names
    assert "investment_price" in table_names
