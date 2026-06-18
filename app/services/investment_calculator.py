"""
Investment portfolio P&L calculator.

Provides pure functions for:
- Weighted average cost calculations (for multiple purchases)
- Unrealized P&L (current holdings)
- Realized P&L (closed positions)
- Portfolio summary (totals and aggregates)

All calculations use floats for MVP simplicity.
No database access - pure functions.

Supports:
- Multiple currencies (ARS primary, but currency-agnostic)
- Fractional shares (crypto, ETFs)
- Short positions (negative quantities)
- Edge cases (zero quantities, zero prices, large numbers)
"""

from typing import List, TypedDict


class Holding(TypedDict):
    """Portfolio holding with quantity, cost, and current price."""

    quantity: float
    avg_cost: float
    current_price: float


class PortfolioSummary(TypedDict):
    """Portfolio summary with investment and P&L totals."""

    total_invested: float
    total_current_value: float
    total_unrealized: float
    realized_pnl: float
    total_pnl: float


def calculate_weighted_avg_cost(
    current_qty: float,
    current_avg: float,
    new_qty: float,
    new_price: float,
) -> float:
    """
    Calculate weighted average cost after a new purchase.

    Formula:
        new_avg = (current_qty × current_avg + new_qty × new_price) / (current_qty + new_qty)

    Args:
        current_qty: Current quantity held
        current_avg: Current weighted average cost
        new_qty: Quantity being purchased
        new_price: Price of new purchase

    Returns:
        Updated weighted average cost (0.0 if no position)

    Examples:
        >>> calculate_weighted_avg_cost(0, 0, 10, 100)
        100.0
        >>> calculate_weighted_avg_cost(10, 100, 5, 110)
        103.33...
    """
    total_qty = current_qty + new_qty

    # No position after purchase
    if total_qty == 0:
        return 0.0

    # Calculate weighted average
    total_cost = (current_qty * current_avg) + (new_qty * new_price)
    return total_cost / total_qty


def calculate_pnl_unrealized(
    quantity: float,
    avg_cost: float,
    current_price: float,
) -> float:
    """
    Calculate unrealized P&L for an open position.

    Formula:
        pnl = (current_price - avg_cost) × quantity

    Args:
        quantity: Current quantity held
        avg_cost: Weighted average cost basis
        current_price: Current market price

    Returns:
        Unrealized profit or loss (positive = gain, negative = loss)

    Examples:
        >>> calculate_pnl_unrealized(10, 100, 110)
        100.0
        >>> calculate_pnl_unrealized(10, 100, 90)
        -100.0
    """
    return (current_price - avg_cost) * quantity


def calculate_pnl_realized(
    quantity_sold: float,
    avg_cost: float,
    sell_price: float,
) -> float:
    """
    Calculate realized P&L from a sale.

    Formula:
        pnl = (sell_price - avg_cost) × quantity_sold

    Args:
        quantity_sold: Quantity sold
        avg_cost: Cost basis of the sold shares
        sell_price: Sale price per share

    Returns:
        Realized profit or loss (positive = gain, negative = loss)

    Examples:
        >>> calculate_pnl_realized(10, 100, 110)
        100.0
        >>> calculate_pnl_realized(10, 100, 90)
        -100.0
    """
    return (sell_price - avg_cost) * quantity_sold


def calculate_portfolio_summary(
    holdings: List[Holding],
    realized_pnl_total: float = 0.0,
) -> PortfolioSummary:
    """
    Calculate portfolio summary totals.

    Args:
        holdings: List of dicts with keys:
            - quantity: Current quantity held
            - avg_cost: Weighted average cost
            - current_price: Current market price
        realized_pnl_total: Sum of realized P&L from closed positions (default 0.0)

    Returns:
        Dict with:
            - total_invested: Sum of (quantity × avg_cost) for all holdings
            - total_current_value: Sum of (quantity × current_price) for all holdings
            - total_unrealized: total_current_value - total_invested
            - realized_pnl: Realized P&L from closed positions
            - total_pnl: total_unrealized + realized_pnl

    Examples:
        >>> holdings = [{"quantity": 10, "avg_cost": 100, "current_price": 110}]
        >>> calculate_portfolio_summary(holdings)
        {
            'total_invested': 1000.0,
            'total_current_value': 1100.0,
            'total_unrealized': 100.0,
            'realized_pnl': 0.0,
            'total_pnl': 100.0
        }
    """
    total_invested = 0.0
    total_current_value = 0.0

    for holding in holdings:
        quantity = holding.get("quantity", 0)
        avg_cost = holding.get("avg_cost", 0)
        current_price = holding.get("current_price", 0)

        total_invested += quantity * avg_cost
        total_current_value += quantity * current_price

    total_unrealized = total_current_value - total_invested
    total_pnl = total_unrealized + realized_pnl_total

    return {
        "total_invested": total_invested,
        "total_current_value": total_current_value,
        "total_unrealized": total_unrealized,
        "realized_pnl": realized_pnl_total,
        "total_pnl": total_pnl,
    }
