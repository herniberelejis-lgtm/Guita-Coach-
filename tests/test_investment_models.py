"""Test Investment, InvestmentTransaction, and InvestmentPrice models."""
import pytest
from app.models import Investment, InvestmentTransaction, InvestmentPrice, User


@pytest.mark.unit
class TestInvestmentModels:
    """Test investment-related models."""

    def test_investment_model_exists(self):
        """Verify Investment model exists and has required attributes."""
        assert hasattr(Investment, "__tablename__")
        assert Investment.__tablename__ == "investment"

    def test_investment_columns_exist(self):
        """Verify Investment model has all required columns."""
        required_columns = [
            "id",
            "user_id",
            "broker",
            "ticker",
            "quantity",
            "avg_cost",
            "purchase_date",
            "status",
            "created_at",
            "updated_at",
        ]
        for col in required_columns:
            assert hasattr(Investment, col), f"Investment missing column: {col}"

    def test_investment_relationships(self):
        """Verify Investment model has relationships."""
        assert hasattr(Investment, "user"), "Investment missing user relationship"
        assert (
            hasattr(Investment, "transactions"),
            "Investment missing transactions relationship",
        )

    def test_investment_transaction_model_exists(self):
        """Verify InvestmentTransaction model exists and has required attributes."""
        assert hasattr(InvestmentTransaction, "__tablename__")
        assert InvestmentTransaction.__tablename__ == "investment_transaction"

    def test_investment_transaction_columns_exist(self):
        """Verify InvestmentTransaction model has all required columns."""
        required_columns = [
            "id",
            "investment_id",
            "user_id",
            "broker",
            "ticker",
            "tx_type",
            "quantity",
            "price",
            "date",
            "csv_reference",
            "linked_transaction_id",
            "created_at",
        ]
        for col in required_columns:
            assert (
                hasattr(InvestmentTransaction, col),
                f"InvestmentTransaction missing column: {col}",
            )

    def test_investment_transaction_relationships(self):
        """Verify InvestmentTransaction model has relationships."""
        assert (
            hasattr(InvestmentTransaction, "investment"),
            "InvestmentTransaction missing investment relationship",
        )
        assert (
            hasattr(InvestmentTransaction, "user"),
            "InvestmentTransaction missing user relationship",
        )

    def test_investment_price_model_exists(self):
        """Verify InvestmentPrice model exists and has required attributes."""
        assert hasattr(InvestmentPrice, "__tablename__")
        assert InvestmentPrice.__tablename__ == "investment_price"

    def test_investment_price_columns_exist(self):
        """Verify InvestmentPrice model has all required columns."""
        required_columns = [
            "id",
            "ticker",
            "price",
            "currency",
            "last_updated",
        ]
        for col in required_columns:
            assert (
                hasattr(InvestmentPrice, col),
                f"InvestmentPrice missing column: {col}",
            )

    def test_user_investment_relationships(self):
        """Verify User model has investment relationships."""
        assert (
            hasattr(User, "investments"),
            "User missing investments relationship",
        )
        assert (
            hasattr(User, "investment_transactions"),
            "User missing investment_transactions relationship",
        )
