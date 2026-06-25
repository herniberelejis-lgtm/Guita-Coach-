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

import statistics
from typing import List, Optional, TypedDict


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


def calculate_concentration_flags(
    holdings: List[dict],
    threshold_pct: float = 30.0,
) -> List[dict]:
    """
    Flags holdings that exceed a concentration threshold of total portfolio value.

    Args:
        holdings: list of dicts with keys: ticker, current_value
        threshold_pct: max recommended % in a single instrument (default 30%,
            matching the advisor's own diversification rule)

    Returns:
        List of {"ticker": str, "pct": float} for tickers over threshold,
        sorted by pct descending. Empty list if portfolio has no value.
    """
    total = sum(h.get("current_value", 0.0) for h in holdings)
    if total <= 0:
        return []
    flags = [
        {"ticker": h.get("ticker", ""), "pct": (h.get("current_value", 0.0) / total) * 100}
        for h in holdings
        if (h.get("current_value", 0.0) / total) * 100 > threshold_pct
    ]
    flags.sort(key=lambda f: f["pct"], reverse=True)
    return flags


def calculate_realized_position(transactions: List[dict]) -> dict:
    """
    Replays a position's full buy/sell history (weighted-average cost) to produce
    a detailed breakdown, used for the closed-positions view.

    Args:
        transactions: list of dicts with keys: tx_type ("buy"|"sell"), quantity,
            price, date (date or ISO string). Order does not matter, they are
            sorted internally by date.

    Returns:
        Dict with: realized_pnl, total_bought_qty, total_sold_qty, avg_buy_price,
        avg_sell_price, first_date, last_date (ISO strings, None if no transactions).
    """
    if not transactions:
        return {
            "realized_pnl": 0.0,
            "total_bought_qty": 0.0,
            "total_sold_qty": 0.0,
            "avg_buy_price": 0.0,
            "avg_sell_price": 0.0,
            "first_date": None,
            "last_date": None,
        }

    txs = sorted(transactions, key=lambda t: str(t["date"]))
    qty = avg = realized = 0.0
    total_bought_qty = total_bought_cost = 0.0
    total_sold_qty = total_sold_revenue = 0.0

    for t in txs:
        if t["tx_type"] == "buy":
            avg = calculate_weighted_avg_cost(qty, avg, t["quantity"], t["price"])
            qty += t["quantity"]
            total_bought_qty += t["quantity"]
            total_bought_cost += t["quantity"] * t["price"]
        else:
            realized += (t["price"] - avg) * t["quantity"]
            qty = max(0.0, qty - t["quantity"])
            total_sold_qty += t["quantity"]
            total_sold_revenue += t["quantity"] * t["price"]

    return {
        "realized_pnl": realized,
        "total_bought_qty": total_bought_qty,
        "total_sold_qty": total_sold_qty,
        "avg_buy_price": (total_bought_cost / total_bought_qty) if total_bought_qty else 0.0,
        "avg_sell_price": (total_sold_revenue / total_sold_qty) if total_sold_qty else 0.0,
        "first_date": str(txs[0]["date"]),
        "last_date": str(txs[-1]["date"]),
    }


def calculate_volatility_pct(values: List[float]) -> Optional[float]:
    """
    Volatility of a value series, as the population stdev of period-over-period
    % returns. None if there are fewer than 2 valid (non-zero-base) returns.
    """
    returns = []
    for prev, curr in zip(values, values[1:]):
        if prev > 0:
            returns.append((curr - prev) / prev * 100)
    if len(returns) < 2:
        return None
    return statistics.pstdev(returns)


def calculate_max_drawdown_pct(values: List[float]) -> Optional[float]:
    """
    Largest peak-to-trough decline (%) observed across a value series.
    None if there are fewer than 2 points.
    """
    if len(values) < 2:
        return None
    peak = values[0]
    max_dd = 0.0
    for v in values:
        peak = max(peak, v)
        if peak > 0:
            max_dd = max(max_dd, (peak - v) / peak * 100)
    return max_dd


def calculate_diversification_score(holdings: List[dict]) -> Optional[float]:
    """
    Diversification score (0-100) from the inverse Herfindahl-Hirschman Index of
    each holding's share of total current_value. 100 = perfectly even split across
    all holdings, 0 = a single holding takes the whole portfolio.

    Args:
        holdings: list of dicts with key: current_value

    Returns:
        Score in [0, 100], or None if portfolio has no value or only one holding.
    """
    total = sum(h.get("current_value", 0.0) for h in holdings)
    if total <= 0:
        return None
    n = len(holdings)
    if n <= 1:
        return 0.0
    hhi = sum((h.get("current_value", 0.0) / total) ** 2 for h in holdings)
    min_hhi = 1.0 / n
    score = (1 - hhi) / (1 - min_hhi) * 100
    return max(0.0, min(100.0, score))


def find_price_at_or_before(history: List[dict], target_date) -> Optional[float]:
    """
    Forward-fill lookup: returns the price of the latest entry in `history` whose
    date is <= target_date.

    Args:
        history: ascending list of dicts with keys: date, price
        target_date: date to look up

    Returns:
        The forward-filled price, or None if no entry has date <= target_date.
    """
    result = None
    for point in history:
        if point["date"] <= target_date:
            result = point["price"]
        else:
            break
    return result


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
