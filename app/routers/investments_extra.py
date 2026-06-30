"""
Investments advanced endpoints: analytics, risk metrics, filtered history, export, transaction edit/delete.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import List, Optional
import csv
from io import StringIO

from app.database import get_db
from app.security import get_current_user
from app.models import InvestmentTransaction, Investment
from app.services.investment_analytics import (
    calculate_xirr,
    calculate_trade_metrics,
    calculate_fiscal_summary,
    calculate_var,
    calculate_cvar,
    calculate_drawdown_metrics,
    calculate_stress_scenarios,
    calculate_correlation_matrix,
)

router = APIRouter(prefix='/api/investments', tags=['investments'])


@router.get('/analytics')
async def get_analytics(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Calculate advanced metrics: TIR, win rate, profit factor, best/worst trade, avg holding days, fiscal summary.
    """
    txs = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).order_by(InvestmentTransaction.date).all()

    if not txs:
        return {
            'xirr_pct': None,
            'win_rate_pct': 0.0,
            'profit_factor': 0.0,
            'best_trade_pct': None,
            'worst_trade_pct': None,
            'avg_holding_days': 0,
            'fiscal_summary': {},
        }

    # For XIRR: convert buys to negative (outflow), sells to positive (inflow)
    xirr_txs = [
        {
            'date': tx.date,
            'amount': -tx.quantity * tx.price if tx.tx_type == 'buy' else tx.quantity * tx.price,
        }
        for tx in txs
    ]

    xirr = calculate_xirr(xirr_txs)
    trade_metrics = calculate_trade_metrics([
        {
            'tx_type': tx.tx_type,
            'quantity': tx.quantity,
            'price': tx.price,
            'date': tx.date,
        }
        for tx in txs
    ])
    fiscal = calculate_fiscal_summary([
        {
            'tx_type': tx.tx_type,
            'quantity': tx.quantity,
            'price': tx.price,
            'date': tx.date,
        }
        for tx in txs
    ])

    return {
        'xirr_pct': round(xirr * 100, 2) if xirr else None,
        'win_rate_pct': trade_metrics['win_rate_pct'],
        'profit_factor': trade_metrics['profit_factor'],
        'best_trade_pct': trade_metrics['best_trade'],
        'worst_trade_pct': trade_metrics['worst_trade'],
        'avg_holding_days': trade_metrics['avg_holding_days'],
        'fiscal_summary': {str(year): val for year, val in fiscal.items()},
    }


@router.get('/risk-metrics')
async def get_risk_metrics(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Risk analysis: VaR, CVaR, drawdown, stress test, correlation between tickers.
    """
    txs = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).order_by(InvestmentTransaction.date).all()

    if not txs:
        return {
            'var_95_pct': None,
            'var_99_pct': None,
            'cvar_95_pct': None,
            'cvar_99_pct': None,
            'max_drawdown_pct': 0.0,
            'current_drawdown_pct': 0.0,
            'stress_scenarios': {},
            'correlation': {},
        }

    # Calculate returns from price data (simplified: use daily prices from transactions)
    # In a real app, fetch actual historical prices per ticker
    returns = []
    by_ticker = {}

    for tx in txs:
        if tx.ticker not in by_ticker:
            by_ticker[tx.ticker] = []
        by_ticker[tx.ticker].append(tx.price)

    # Simple return calculation from available prices
    for ticker, prices in by_ticker.items():
        for i in range(1, len(prices)):
            ret = (prices[i] - prices[i-1]) / prices[i-1] if prices[i-1] != 0 else 0
            returns.append(ret)

    var_95 = calculate_var(returns, 0.95) if returns else None
    var_99 = calculate_var(returns, 0.99) if returns else None
    cvar_95 = calculate_cvar(returns, 0.95) if returns else None
    cvar_99 = calculate_cvar(returns, 0.99) if returns else None

    # Portfolio values over time (simplified: sum of all holdings)
    holdings_by_date = {}
    for tx in txs:
        key = tx.date.isoformat() if isinstance(tx.date, datetime) else str(tx.date)
        if key not in holdings_by_date:
            holdings_by_date[key] = 0
        holdings_by_date[key] += tx.quantity * tx.price

    values = list(holdings_by_date.values()) if holdings_by_date else []
    dd_metrics = calculate_drawdown_metrics(values)

    # Current portfolio value
    current_holdings = {}
    for tx in txs:
        if tx.ticker not in current_holdings:
            current_holdings[tx.ticker] = 0
        qty_delta = tx.quantity if tx.tx_type == 'buy' else -tx.quantity
        current_holdings[tx.ticker] += qty_delta

    current_value = sum(qty * tx.price for tx in txs if tx.ticker in current_holdings) / len(txs) * len(current_holdings) if txs else 0

    stress = calculate_stress_scenarios(current_value or 1000) if current_value else {}

    # Correlation
    price_series = {ticker: prices for ticker, prices in by_ticker.items()}
    correlation = calculate_correlation_matrix(price_series)

    return {
        'var_95_pct': var_95,
        'var_99_pct': var_99,
        'cvar_95_pct': cvar_95,
        'cvar_99_pct': cvar_99,
        'max_drawdown_pct': dd_metrics['max_drawdown_pct'],
        'current_drawdown_pct': dd_metrics['current_drawdown_pct'],
        'stress_scenarios': stress,
        'correlation': correlation,
    }


@router.get('/history-v2')
async def get_history_filtered(
    ticker: Optional[str] = None,
    tx_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    currency: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Get transaction history with filters: ticker, tx_type (buy/sell), date range, currency, text search.
    """
    q = db.query(InvestmentTransaction).filter(InvestmentTransaction.user_id == user.id)

    if ticker:
        q = q.filter(InvestmentTransaction.ticker == ticker.upper())
    if tx_type:
        q = q.filter(InvestmentTransaction.tx_type == tx_type.lower())

    if date_from:
        try:
            df = datetime.fromisoformat(date_from).date()
            q = q.filter(InvestmentTransaction.date >= df)
        except:
            pass

    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).date()
            q = q.filter(InvestmentTransaction.date <= dt)
        except:
            pass

    if currency:
        q = q.filter(InvestmentTransaction.currency == currency.upper())

    txs = q.order_by(InvestmentTransaction.date.desc()).all()

    if search:
        search_lower = search.lower()
        txs = [t for t in txs if search_lower in (t.ticker or '').lower() or search_lower in (t.broker or '').lower()]

    return [
        {
            'id': t.id,
            'ticker': t.ticker,
            'tx_type': t.tx_type,
            'quantity': t.quantity,
            'price': t.price,
            'date': t.date.isoformat() if isinstance(t.date, datetime) else str(t.date),
            'currency': t.currency,
            'broker': t.broker,
            'csv_reference': t.csv_reference,
        }
        for t in txs
    ]


@router.get('/export-csv')
async def export_csv(
    ticker: Optional[str] = None,
    tx_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    currency: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Export filtered transactions as CSV (UTF-8 BOM).
    """
    q = db.query(InvestmentTransaction).filter(InvestmentTransaction.user_id == user.id)

    if ticker:
        q = q.filter(InvestmentTransaction.ticker == ticker.upper())
    if tx_type:
        q = q.filter(InvestmentTransaction.tx_type == tx_type.lower())
    if date_from:
        try:
            df = datetime.fromisoformat(date_from).date()
            q = q.filter(InvestmentTransaction.date >= df)
        except:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).date()
            q = q.filter(InvestmentTransaction.date <= dt)
        except:
            pass
    if currency:
        q = q.filter(InvestmentTransaction.currency == currency.upper())

    txs = q.order_by(InvestmentTransaction.date).all()

    output = StringIO()
    output.write('﻿')  # BOM UTF-8
    writer = csv.DictWriter(
        output,
        fieldnames=['Fecha', 'Ticker', 'Tipo', 'Cantidad', 'Precio', 'Moneda', 'Broker', 'Referencia CSV'],
    )
    writer.writeheader()
    for t in txs:
        writer.writerow({
            'Fecha': t.date.isoformat() if isinstance(t.date, datetime) else str(t.date),
            'Ticker': t.ticker,
            'Tipo': t.tx_type.upper(),
            'Cantidad': t.quantity,
            'Precio': t.price,
            'Moneda': t.currency,
            'Broker': t.broker or '',
            'Referencia CSV': t.csv_reference or '',
        })

    return {
        'csv': output.getvalue(),
        'filename': f'inversiones_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv',
    }


@router.patch('/transaction/{tx_id}')
async def update_transaction(
    tx_id: int,
    data: dict,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Edit a transaction: quantity, price, date.
    """
    tx = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.id == tx_id,
        InvestmentTransaction.user_id == user.id,
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail='Transacción no encontrada')

    if 'quantity' in data:
        tx.quantity = float(data['quantity'])
    if 'price' in data:
        tx.price = float(data['price'])
    if 'date' in data:
        try:
            tx.date = datetime.fromisoformat(data['date']).date()
        except:
            pass

    db.commit()

    return {
        'id': tx.id,
        'ticker': tx.ticker,
        'tx_type': tx.tx_type,
        'quantity': tx.quantity,
        'price': tx.price,
        'date': tx.date.isoformat() if isinstance(tx.date, datetime) else str(tx.date),
    }


@router.delete('/transaction/{tx_id}')
async def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Delete a transaction.
    """
    tx = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.id == tx_id,
        InvestmentTransaction.user_id == user.id,
    ).first()

    if not tx:
        raise HTTPException(status_code=404, detail='Transacción no encontrada')

    db.delete(tx)
    db.commit()

    return {'ok': True}
