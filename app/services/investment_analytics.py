"""
Advanced investment analytics: TIR, win rate, VaR, CVaR, drawdown, correlación, estrés.

Funciones puras para análisis de cartera en profundidad.
No hay acceso a DB, I/O, ni dependencias externas.
"""

from datetime import datetime, date
from typing import List, Dict, Optional, Tuple
import statistics
from math import sqrt, log, exp


def calculate_xirr(transactions: List[dict]) -> Optional[float]:
    """
    Calculate XIRR (TIR) for irregular cash flows.

    transactions: list of dicts with 'date' (datetime/date), 'amount' (float, negative=outflow).
    Returns: TIR as decimal (0.15 = 15%), None if can't compute.

    Uses bisection method to solve NPV=0 over cash flows.
    """
    if not transactions or len(transactions) < 2:
        return None

    # Ensure at least one inflow and one outflow
    inflows = sum(1 for t in transactions if t.get('amount', 0) > 0)
    outflows = sum(1 for t in transactions if t.get('amount', 0) < 0)
    if inflows == 0 or outflows == 0:
        return None

    def npv(rate: float, txs: List[dict]) -> float:
        total = 0.0
        ref_date = min(t['date'] for t in txs)
        if isinstance(ref_date, datetime):
            ref_date = ref_date.date()

        for tx in txs:
            tx_date = tx['date']
            if isinstance(tx_date, datetime):
                tx_date = tx_date.date()
            days = (tx_date - ref_date).days
            years = days / 365.25
            total += tx['amount'] / ((1 + rate) ** years)
        return total

    # Bisection: find rate where NPV=0
    low, high = -0.99, 5.0
    for _ in range(100):
        mid = (low + high) / 2
        n = npv(mid, transactions)
        if abs(n) < 0.01:
            return mid
        if n > 0:
            low = mid
        else:
            high = mid

    return None


def calculate_trade_metrics(transactions: List[dict]) -> dict:
    """
    Calculate win rate, profit factor, best/worst trade, avg holding days.

    transactions: list of dicts with 'tx_type' (buy/sell), 'quantity', 'price', 'date'.
    Returns: dict with win_rate_pct, profit_factor, best_trade, worst_trade, avg_holding_days.
    """
    if not transactions:
        return {
            'win_rate_pct': 0.0,
            'profit_factor': 0.0,
            'best_trade': None,
            'worst_trade': None,
            'avg_holding_days': 0,
        }

    # Match buys with sells (FIFO)
    buys = [t for t in transactions if t.get('tx_type') == 'buy']
    sells = [t for t in transactions if t.get('tx_type') == 'sell']
    buys.sort(key=lambda x: x.get('date', datetime.min))
    sells.sort(key=lambda x: x.get('date', datetime.min))

    trades = []
    remaining_qty = 0.0
    buy_cost = 0.0
    buy_date = None

    for sell in sells:
        sell_qty = sell.get('quantity', 0)
        sell_price = sell.get('price', 0)
        sell_date = sell.get('date', datetime.now())

        for buy in buys:
            if buy_qty_remaining := buy.get('quantity', 0):
                buy_price = buy.get('price', 0)
                matched = min(buy_qty_remaining, sell_qty)

                cost = matched * buy_price
                revenue = matched * sell_price
                pnl = revenue - cost

                if isinstance(buy_date, (datetime, date)) and isinstance(sell_date, (datetime, date)):
                    days = (sell_date - buy_date).days if isinstance(sell_date, date) else (
                        sell_date.date() - (buy_date.date() if isinstance(buy_date, datetime) else buy_date)
                    ).days
                else:
                    days = 0

                trades.append({
                    'pnl': pnl,
                    'pnl_pct': (pnl / cost * 100) if cost else 0,
                    'days': max(1, days),
                })

                sell_qty -= matched
                if sell_qty <= 0:
                    break

    if not trades:
        return {
            'win_rate_pct': 0.0,
            'profit_factor': 0.0,
            'best_trade': None,
            'worst_trade': None,
            'avg_holding_days': 0,
        }

    winning = [t for t in trades if t['pnl'] > 0]
    losing = [t for t in trades if t['pnl'] < 0]
    win_rate = len(winning) / len(trades) * 100 if trades else 0

    profit_factor = 0.0
    if losing:
        sum_wins = sum(t['pnl'] for t in winning)
        sum_loss = abs(sum(t['pnl'] for t in losing))
        profit_factor = sum_wins / sum_loss if sum_loss > 0 else 0

    best = max(trades, key=lambda t: t['pnl'], default=None)
    worst = min(trades, key=lambda t: t['pnl'], default=None)
    avg_days = statistics.mean(t['days'] for t in trades) if trades else 0

    return {
        'win_rate_pct': round(win_rate, 2),
        'profit_factor': round(profit_factor, 2),
        'best_trade': best['pnl_pct'] if best else None,
        'worst_trade': worst['pnl_pct'] if worst else None,
        'avg_holding_days': round(avg_days, 1),
    }


def calculate_fiscal_summary(transactions: List[dict]) -> Dict[int, dict]:
    """
    Summarize P&L by calendar year.

    transactions: list with 'tx_type', 'quantity', 'price', 'date'.
    Returns: dict {year: {'realized_pnl': float, 'tax_event_count': int}}.
    """
    by_year = {}

    for tx in transactions:
        if tx.get('tx_type') != 'sell':
            continue

        tx_date = tx.get('date', datetime.now())
        if isinstance(tx_date, datetime):
            tx_date = tx_date.date()
        year = tx_date.year

        quantity = tx.get('quantity', 0)
        price = tx.get('price', 0)
        revenue = quantity * price

        if year not in by_year:
            by_year[year] = {'realized_pnl': 0.0, 'tax_event_count': 0}

        by_year[year]['realized_pnl'] += revenue
        by_year[year]['tax_event_count'] += 1

    return by_year


def calculate_var(returns: List[float], confidence: float = 0.95, horizon_days: int = 22) -> Optional[float]:
    """
    Calculate parametric VaR using normal distribution.

    returns: list of daily returns (as decimals: 0.01 = 1%).
    confidence: 0.95 or 0.99 for 95% or 99% VaR.
    horizon_days: holding period in days (default 22 for 1 month).
    Returns: loss as percentage of portfolio value.
    """
    if not returns or len(returns) < 2:
        return None

    mu = statistics.mean(returns)
    sigma = statistics.stdev(returns)

    # Z-scores for common confidence levels
    z_scores = {0.95: 1.645, 0.99: 2.326}
    z = z_scores.get(confidence, 1.645)

    # Scale to holding period
    daily_var = mu - z * sigma
    var_hp = daily_var * sqrt(horizon_days)

    return round(var_hp * 100, 2)


def calculate_cvar(returns: List[float], confidence: float = 0.95, horizon_days: int = 22) -> Optional[float]:
    """
    Calculate CVaR (Expected Shortfall, conditional VaR).

    CVaR = average loss beyond the VaR threshold.
    """
    if not returns or len(returns) < 2:
        return None

    var = calculate_var(returns, confidence, horizon_days)
    if var is None:
        return None

    # Parametric approximation: CVaR ≈ VaR / confidence + (mu - z*sigma) adjustment
    # For normal distribution: CVaR ≈ VaR * (1 + (z / (1 - confidence)))
    # Simplified: E[X | X < -VaR]
    mu = statistics.mean(returns)
    sigma = statistics.stdev(returns)
    z_scores = {0.95: 1.645, 0.99: 2.326}
    z = z_scores.get(confidence, 1.645)

    # phi(z) / (1 - confidence) for normal dist
    # Approximation
    phi_z = exp(-0.5 * z * z) / sqrt(2 * 3.14159)
    cvar_daily = mu - sigma * phi_z / (1 - confidence)
    cvar_hp = cvar_daily * sqrt(horizon_days)

    return round(cvar_hp * 100, 2)


def calculate_drawdown_metrics(values: List[float]) -> dict:
    """
    Calculate max drawdown, current drawdown, and peak/valley dates.

    values: list of portfolio values in chronological order.
    Returns: dict with max_drawdown_pct, current_drawdown_pct, peak_date, valley_date, current_peak.
    """
    if not values or len(values) < 2:
        return {
            'max_drawdown_pct': 0.0,
            'current_drawdown_pct': 0.0,
            'peak_value': None,
            'valley_value': None,
            'current_peak_value': None,
        }

    max_dd = 0.0
    peak = values[0]
    peak_idx = 0
    valley_idx = 0

    for i, val in enumerate(values):
        if val > peak:
            peak = val
            peak_idx = i
        dd = (peak - val) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd
            valley_idx = i

    current_dd = (peak - values[-1]) / peak if peak > 0 else 0

    return {
        'max_drawdown_pct': round(max_dd * 100, 2),
        'current_drawdown_pct': round(current_dd * 100, 2),
        'peak_idx': peak_idx,
        'valley_idx': valley_idx,
    }


def calculate_stress_scenarios(portfolio_value: float, scenarios: List[float] = None) -> dict:
    """
    Calculate portfolio value under stress scenarios.

    portfolio_value: current portfolio value.
    scenarios: list of shocks as decimals (default [-0.2, -0.4, -0.7] for -20%, -40%, -70%).
    Returns: dict {scenario_label: new_value}.
    """
    if scenarios is None:
        scenarios = [-0.2, -0.4, -0.7]

    result = {}
    for shock in scenarios:
        label = f'{int(shock * -100)}%'
        new_val = portfolio_value * (1 + shock)
        result[label] = round(new_val, 2)

    return result


def calculate_correlation_matrix(price_series: Dict[str, List[float]]) -> Dict[str, Dict[str, float]]:
    """
    Calculate Pearson correlation between all pairs of tickers.

    price_series: dict {ticker: list of prices in chronological order}.
    Returns: dict {ticker: {other_ticker: correlation}}.
    """
    if not price_series or len(price_series) < 2:
        return {}

    # Convert prices to returns
    returns_series = {}
    for ticker, prices in price_series.items():
        if len(prices) < 2:
            continue
        returns = []
        for i in range(1, len(prices)):
            ret = (prices[i] - prices[i-1]) / prices[i-1] if prices[i-1] != 0 else 0
            returns.append(ret)
        if returns:
            returns_series[ticker] = returns

    tickers = list(returns_series.keys())
    correlation = {}

    for i, t1 in enumerate(tickers):
        correlation[t1] = {}
        for t2 in tickers:
            if t1 == t2:
                correlation[t1][t2] = 1.0
            elif t2 in correlation and t1 in correlation[t2]:
                correlation[t1][t2] = correlation[t2][t1]
            else:
                r1, r2 = returns_series[t1], returns_series[t2]

                # Only correlate over common dates
                min_len = min(len(r1), len(r2))
                if min_len < 2:
                    correlation[t1][t2] = 0.0
                    continue

                r1, r2 = r1[:min_len], r2[:min_len]

                mean1, mean2 = statistics.mean(r1), statistics.mean(r2)
                dev1 = [x - mean1 for x in r1]
                dev2 = [x - mean2 for x in r2]

                cov = sum(d1 * d2 for d1, d2 in zip(dev1, dev2)) / len(r1)
                std1 = statistics.stdev(r1) if len(r1) > 1 else 0
                std2 = statistics.stdev(r2) if len(r2) > 1 else 0

                if std1 > 0 and std2 > 0:
                    corr = cov / (std1 * std2)
                    correlation[t1][t2] = round(max(-1, min(1, corr)), 3)
                else:
                    correlation[t1][t2] = 0.0

    return correlation
