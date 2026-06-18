"""
Tests for investment portfolio P&L calculations.

Uses TDD approach:
1. Write failing tests first (RED)
2. Implement minimal code to pass (GREEN)
3. Refactor (IMPROVE)
"""

import pytest
from app.services.investment_calculator import (
    calculate_weighted_avg_cost,
    calculate_pnl_unrealized,
    calculate_pnl_realized,
    calculate_portfolio_summary,
)


class TestWeightedAverageCost:
    """Test weighted average cost calculations."""

    def test_single_buy(self):
        """First purchase sets the average cost."""
        result = calculate_weighted_avg_cost(
            current_qty=0,
            current_avg=0,
            new_qty=10,
            new_price=100.0,
        )
        assert result == 100.0

    def test_multiple_buys_same_price(self):
        """Multiple purchases at same price maintain that price."""
        # First buy
        avg = calculate_weighted_avg_cost(0, 0, 10, 100.0)
        assert avg == 100.0

        # Second buy at same price
        avg = calculate_weighted_avg_cost(10, avg, 5, 100.0)
        assert avg == 100.0

    def test_multiple_buys_different_prices(self):
        """Multiple buys at different prices update weighted average."""
        # 10 @ $100
        avg = calculate_weighted_avg_cost(0, 0, 10, 100.0)
        assert avg == 100.0

        # + 5 @ $110 = (1000 + 550) / 15 = 103.33...
        avg = calculate_weighted_avg_cost(10, 100.0, 5, 110.0)
        assert abs(avg - 103.333333) < 0.01

    def test_buy_lower_price_reduces_average(self):
        """Buying at lower price reduces weighted average."""
        # 10 @ $100
        avg = calculate_weighted_avg_cost(0, 0, 10, 100.0)
        assert avg == 100.0

        # + 10 @ $80 = (1000 + 800) / 20 = 90.0
        avg = calculate_weighted_avg_cost(10, 100.0, 10, 80.0)
        assert avg == 90.0

    def test_buy_higher_price_increases_average(self):
        """Buying at higher price increases weighted average."""
        # 10 @ $100
        avg = calculate_weighted_avg_cost(0, 0, 10, 100.0)
        assert avg == 100.0

        # + 10 @ $120 = (1000 + 1200) / 20 = 110.0
        avg = calculate_weighted_avg_cost(10, 100.0, 10, 120.0)
        assert avg == 110.0

    def test_small_additional_purchase(self):
        """Small additional purchase has minimal effect on large position."""
        # 100 @ $100
        avg = calculate_weighted_avg_cost(0, 0, 100, 100.0)
        assert avg == 100.0

        # + 1 @ $200 = (10000 + 200) / 101 = 100.99...
        avg = calculate_weighted_avg_cost(100, 100.0, 1, 200.0)
        assert abs(avg - 100.99) < 0.01

    def test_zero_new_quantity(self):
        """Zero new quantity returns current average (no purchase)."""
        result = calculate_weighted_avg_cost(
            current_qty=10,
            current_avg=100.0,
            new_qty=0,
            new_price=50.0,
        )
        assert result == 100.0

    def test_zero_current_quantity_first_buy(self):
        """Zero current quantity (first buy) sets average to new price."""
        result = calculate_weighted_avg_cost(
            current_qty=0,
            current_avg=0,
            new_qty=5,
            new_price=75.0,
        )
        assert result == 75.0

    def test_large_numbers(self):
        """Works with large position sizes."""
        # 10000 @ $1000
        avg = calculate_weighted_avg_cost(0, 0, 10000, 1000.0)
        assert avg == 1000.0

        # + 5000 @ $1100
        avg = calculate_weighted_avg_cost(10000, 1000.0, 5000, 1100.0)
        assert abs(avg - 1033.333333) < 0.01

    def test_fractional_quantities_and_prices(self):
        """Handles fractional shares and prices (crypto, ETFs)."""
        # 0.5 @ $50000
        avg = calculate_weighted_avg_cost(0, 0, 0.5, 50000.0)
        assert avg == 50000.0

        # + 0.25 @ $55000 = (25000 + 13750) / 0.75 = 51666.67
        avg = calculate_weighted_avg_cost(0.5, 50000.0, 0.25, 55000.0)
        assert abs(avg - 51666.67) < 0.01

    def test_price_zero_edge_case(self):
        """New price of zero returns weighted average including zero."""
        # 10 @ $100
        avg = calculate_weighted_avg_cost(0, 0, 10, 100.0)
        assert avg == 100.0

        # + 10 @ $0 = 1000 / 20 = 50.0
        avg = calculate_weighted_avg_cost(10, 100.0, 10, 0.0)
        assert avg == 50.0


class TestUnrealizedPnL:
    """Test unrealized P&L (open positions)."""

    def test_breakeven_position(self):
        """No gain or loss when price equals cost."""
        result = calculate_pnl_unrealized(
            quantity=10,
            avg_cost=100.0,
            current_price=100.0,
        )
        assert result == 0.0

    def test_gain_position(self):
        """Gain when current price > avg cost."""
        # 10 shares @ $100 avg, now worth $110
        # P&L = (110 - 100) * 10 = $100 gain
        result = calculate_pnl_unrealized(
            quantity=10,
            avg_cost=100.0,
            current_price=110.0,
        )
        assert result == 100.0

    def test_loss_position(self):
        """Loss when current price < avg cost."""
        # 10 shares @ $100 avg, now worth $90
        # P&L = (90 - 100) * 10 = -$100 loss
        result = calculate_pnl_unrealized(
            quantity=10,
            avg_cost=100.0,
            current_price=90.0,
        )
        assert result == -100.0

    def test_large_gain(self):
        """Large unrealized gain."""
        # 100 @ $100, now $200
        # P&L = 100 * 100 = $10000
        result = calculate_pnl_unrealized(
            quantity=100,
            avg_cost=100.0,
            current_price=200.0,
        )
        assert result == 10000.0

    def test_large_loss(self):
        """Large unrealized loss."""
        # 100 @ $100, now $50
        # P&L = -50 * 100 = -$5000
        result = calculate_pnl_unrealized(
            quantity=100,
            avg_cost=100.0,
            current_price=50.0,
        )
        assert result == -5000.0

    def test_small_fractional_gain(self):
        """Small gain on fractional shares."""
        # 0.5 @ $50000, now $51000
        # P&L = 1000 * 0.5 = $500
        result = calculate_pnl_unrealized(
            quantity=0.5,
            avg_cost=50000.0,
            current_price=51000.0,
        )
        assert result == 500.0

    def test_zero_quantity(self):
        """Zero quantity returns zero P&L."""
        result = calculate_pnl_unrealized(
            quantity=0,
            avg_cost=100.0,
            current_price=110.0,
        )
        assert result == 0.0

    def test_zero_cost(self):
        """Zero cost basis results in full current value as P&L."""
        # 10 shares with 0 cost, now worth $50
        # P&L = 50 * 10 = $500
        result = calculate_pnl_unrealized(
            quantity=10,
            avg_cost=0.0,
            current_price=50.0,
        )
        assert result == 500.0

    def test_zero_current_price(self):
        """Zero current price results in loss equal to cost."""
        # 10 @ $100, now worth $0
        # P&L = (0 - 100) * 10 = -$1000
        result = calculate_pnl_unrealized(
            quantity=10,
            avg_cost=100.0,
            current_price=0.0,
        )
        assert result == -1000.0

    def test_percentage_gain_example(self):
        """Example: 50% gain scenario."""
        # 20 @ $100 avg, now $150 (50% gain)
        # P&L = (150 - 100) * 20 = $1000
        result = calculate_pnl_unrealized(
            quantity=20,
            avg_cost=100.0,
            current_price=150.0,
        )
        assert result == 1000.0


class TestRealizedPnL:
    """Test realized P&L (closed positions)."""

    def test_breakeven_sale(self):
        """No gain or loss when selling at cost."""
        result = calculate_pnl_realized(
            quantity_sold=10,
            avg_cost=100.0,
            sell_price=100.0,
        )
        assert result == 0.0

    def test_profitable_sale(self):
        """Gain when selling above cost."""
        # Sell 10 @ $110, cost was $100
        # P&L = (110 - 100) * 10 = $100 gain
        result = calculate_pnl_realized(
            quantity_sold=10,
            avg_cost=100.0,
            sell_price=110.0,
        )
        assert result == 100.0

    def test_loss_sale(self):
        """Loss when selling below cost."""
        # Sell 10 @ $90, cost was $100
        # P&L = (90 - 100) * 10 = -$100 loss
        result = calculate_pnl_realized(
            quantity_sold=10,
            avg_cost=100.0,
            sell_price=90.0,
        )
        assert result == -100.0

    def test_large_profitable_sale(self):
        """Large realized gain."""
        # Sell 100 @ $150, cost was $100
        # P&L = 50 * 100 = $5000
        result = calculate_pnl_realized(
            quantity_sold=100,
            avg_cost=100.0,
            sell_price=150.0,
        )
        assert result == 5000.0

    def test_large_loss_sale(self):
        """Large realized loss."""
        # Sell 100 @ $50, cost was $100
        # P&L = -50 * 100 = -$5000
        result = calculate_pnl_realized(
            quantity_sold=100,
            avg_cost=100.0,
            sell_price=50.0,
        )
        assert result == -5000.0

    def test_partial_sell(self):
        """Selling partial position."""
        # Sell 5 of 10 shares @ $110, cost $100
        # P&L = 10 * 5 = $50
        result = calculate_pnl_realized(
            quantity_sold=5,
            avg_cost=100.0,
            sell_price=110.0,
        )
        assert result == 50.0

    def test_zero_quantity(self):
        """Zero quantity sold returns zero P&L."""
        result = calculate_pnl_realized(
            quantity_sold=0,
            avg_cost=100.0,
            sell_price=110.0,
        )
        assert result == 0.0

    def test_sell_at_zero_price(self):
        """Selling at zero price (worthless)."""
        # Sell 10 @ $0, cost was $100
        # P&L = (0 - 100) * 10 = -$1000
        result = calculate_pnl_realized(
            quantity_sold=10,
            avg_cost=100.0,
            sell_price=0.0,
        )
        assert result == -1000.0

    def test_fractional_shares(self):
        """Selling fractional shares."""
        # Sell 0.25 @ $55000, cost $50000
        # P&L = 5000 * 0.25 = $1250
        result = calculate_pnl_realized(
            quantity_sold=0.25,
            avg_cost=50000.0,
            sell_price=55000.0,
        )
        assert result == 1250.0


class TestPortfolioSummary:
    """Test portfolio-level calculations."""

    def test_empty_portfolio(self):
        """Empty portfolio has zero values."""
        result = calculate_portfolio_summary(holdings=[], realized_pnl_total=0.0)

        assert result["total_invested"] == 0.0
        assert result["total_current_value"] == 0.0
        assert result["total_unrealized"] == 0.0
        assert result["realized_pnl"] == 0.0
        assert result["total_pnl"] == 0.0

    def test_single_holding_breakeven(self):
        """Single holding at breakeven."""
        holdings = [
            {
                "quantity": 10,
                "avg_cost": 100.0,
                "current_price": 100.0,
            }
        ]
        result = calculate_portfolio_summary(holdings, realized_pnl_total=0.0)

        assert result["total_invested"] == 1000.0  # 10 * 100
        assert result["total_current_value"] == 1000.0  # 10 * 100
        assert result["total_unrealized"] == 0.0
        assert result["realized_pnl"] == 0.0
        assert result["total_pnl"] == 0.0

    def test_single_holding_unrealized_gain(self):
        """Single holding with unrealized gain."""
        holdings = [
            {
                "quantity": 10,
                "avg_cost": 100.0,
                "current_price": 110.0,
            }
        ]
        result = calculate_portfolio_summary(holdings, realized_pnl_total=0.0)

        assert result["total_invested"] == 1000.0
        assert result["total_current_value"] == 1100.0
        assert result["total_unrealized"] == 100.0
        assert result["total_pnl"] == 100.0

    def test_single_holding_unrealized_loss(self):
        """Single holding with unrealized loss."""
        holdings = [
            {
                "quantity": 10,
                "avg_cost": 100.0,
                "current_price": 90.0,
            }
        ]
        result = calculate_portfolio_summary(holdings, realized_pnl_total=0.0)

        assert result["total_invested"] == 1000.0
        assert result["total_current_value"] == 900.0
        assert result["total_unrealized"] == -100.0
        assert result["total_pnl"] == -100.0

    def test_multiple_holdings_mixed_results(self):
        """Multiple holdings with mixed gains and losses."""
        holdings = [
            # Stock A: 10 @ $100 avg, now $110 = +$100 gain
            {
                "quantity": 10,
                "avg_cost": 100.0,
                "current_price": 110.0,
            },
            # Stock B: 5 @ $200 avg, now $180 = -$100 loss
            {
                "quantity": 5,
                "avg_cost": 200.0,
                "current_price": 180.0,
            },
        ]
        result = calculate_portfolio_summary(holdings, realized_pnl_total=0.0)

        # Total invested: (10*100) + (5*200) = 1000 + 1000 = 2000
        assert result["total_invested"] == 2000.0

        # Total current value: (10*110) + (5*180) = 1100 + 900 = 2000
        assert result["total_current_value"] == 2000.0

        # Unrealized: 100 + (-100) = 0
        assert result["total_unrealized"] == 0.0

        # Total P&L: 0 + 0 = 0
        assert result["total_pnl"] == 0.0

    def test_portfolio_with_realized_pnl(self):
        """Portfolio includes both unrealized and realized P&L."""
        holdings = [
            # Open position: 10 @ $100, now $110 = +$100 unrealized
            {
                "quantity": 10,
                "avg_cost": 100.0,
                "current_price": 110.0,
            },
        ]
        # + realized gain from closed position
        realized_pnl_total = 500.0

        result = calculate_portfolio_summary(holdings, realized_pnl_total)

        assert result["total_invested"] == 1000.0
        assert result["total_current_value"] == 1100.0
        assert result["total_unrealized"] == 100.0
        assert result["realized_pnl"] == 500.0
        assert result["total_pnl"] == 600.0  # 100 + 500

    def test_complex_portfolio(self):
        """Complex portfolio with multiple holdings and realized P&L."""
        holdings = [
            # AAPL: 100 @ $150 avg, now $165 = +$1500
            {"quantity": 100, "avg_cost": 150.0, "current_price": 165.0},
            # MSFT: 50 @ $300 avg, now $280 = -$1000
            {"quantity": 50, "avg_cost": 300.0, "current_price": 280.0},
            # GOOGL: 25 @ $2000 avg, now $2100 = +$2500
            {"quantity": 25, "avg_cost": 2000.0, "current_price": 2100.0},
        ]
        realized_pnl_total = 2000.0

        result = calculate_portfolio_summary(holdings, realized_pnl_total)

        # Total invested:
        # (100 * 150) + (50 * 300) + (25 * 2000)
        # = 15000 + 15000 + 50000 = 80000
        assert result["total_invested"] == 80000.0

        # Total current value:
        # (100 * 165) + (50 * 280) + (25 * 2100)
        # = 16500 + 14000 + 52500 = 83000
        assert result["total_current_value"] == 83000.0

        # Unrealized: 1500 - 1000 + 2500 = 3000
        assert result["total_unrealized"] == 3000.0

        # Total P&L: 3000 + 2000 = 5000
        assert result["total_pnl"] == 5000.0

    def test_zero_cost_holdings(self):
        """Holdings with zero cost (free shares, grants, etc)."""
        holdings = [
            {
                "quantity": 50,
                "avg_cost": 0.0,
                "current_price": 100.0,
            }
        ]
        result = calculate_portfolio_summary(holdings)

        assert result["total_invested"] == 0.0
        assert result["total_current_value"] == 5000.0
        assert result["total_unrealized"] == 5000.0
        assert result["total_pnl"] == 5000.0

    def test_zero_quantity_holdings_ignored(self):
        """Zero quantity holdings contribute zero."""
        holdings = [
            {"quantity": 0, "avg_cost": 100.0, "current_price": 110.0},
            {"quantity": 10, "avg_cost": 100.0, "current_price": 110.0},
        ]
        result = calculate_portfolio_summary(holdings)

        assert result["total_invested"] == 1000.0
        assert result["total_current_value"] == 1100.0

    def test_large_portfolio_calculation(self):
        """Large portfolio with many holdings."""
        holdings = [
            {
                "quantity": 1000 * i,
                "avg_cost": 100.0 + (i * 10),
                "current_price": 110.0 + (i * 10),
            }
            for i in range(1, 6)
        ]

        result = calculate_portfolio_summary(holdings)

        # Verify it calculates without overflow or precision issues
        assert result["total_invested"] > 0
        assert result["total_current_value"] > 0
        assert result["total_unrealized"] > 0

    def test_negative_realized_pnl(self):
        """Portfolio with realized loss."""
        holdings = [
            {"quantity": 10, "avg_cost": 100.0, "current_price": 110.0},
        ]
        realized_pnl_total = -200.0

        result = calculate_portfolio_summary(holdings, realized_pnl_total)

        assert result["total_unrealized"] == 100.0
        assert result["realized_pnl"] == -200.0
        assert result["total_pnl"] == -100.0  # 100 + (-200)

    def test_all_closed_positions(self):
        """Portfolio with all closed positions (no current holdings)."""
        result = calculate_portfolio_summary(holdings=[], realized_pnl_total=5000.0)

        assert result["total_invested"] == 0.0
        assert result["total_current_value"] == 0.0
        assert result["total_unrealized"] == 0.0
        assert result["realized_pnl"] == 5000.0
        assert result["total_pnl"] == 5000.0


class TestEdgeCasesAndValidation:
    """Test edge cases and error handling."""

    def test_negative_quantity(self):
        """Negative quantity (short position)."""
        # Short 10 shares @ $100 avg, now $110
        # P&L = (110 - 100) * -10 = -$100 loss
        result = calculate_pnl_unrealized(
            quantity=-10,
            avg_cost=100.0,
            current_price=110.0,
        )
        assert result == -100.0

    def test_negative_realized_with_short(self):
        """Realized P&L on short sale."""
        # Sold short 10 @ $100, bought back @ $90
        # P&L = (90 - 100) * -10 = $100 gain
        result = calculate_pnl_realized(
            quantity_sold=-10,
            avg_cost=100.0,
            sell_price=90.0,
        )
        assert result == 100.0

    def test_very_small_numbers(self):
        """Very small amounts (fractional cents)."""
        result = calculate_weighted_avg_cost(
            current_qty=1,
            current_avg=0.001,
            new_qty=1,
            new_price=0.002,
        )
        assert abs(result - 0.0015) < 0.00001

    def test_very_large_numbers(self):
        """Very large position values."""
        result = calculate_pnl_unrealized(
            quantity=1000000,
            avg_cost=1000.0,
            current_price=1100.0,
        )
        assert result == 100000000.0  # 100 * 1000000

    def test_portfolio_with_many_holdings(self):
        """Portfolio with 100+ holdings."""
        holdings = [
            {
                "quantity": 10 + i,
                "avg_cost": 100.0,
                "current_price": 105.0,
            }
            for i in range(100)
        ]
        result = calculate_portfolio_summary(holdings)
        assert result["total_pnl"] > 0
