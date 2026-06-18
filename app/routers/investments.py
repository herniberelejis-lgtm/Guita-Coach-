"""Investment portfolio endpoints — upload, holdings, history, P&L summary."""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..database import get_db
from ..models import User, Investment, InvestmentTransaction, InvestmentPrice
from ..security import get_current_user
from ..services.investment_parser import parse_csv
from ..services.investment_calculator import (
    calculate_weighted_avg_cost,
    calculate_pnl_unrealized,
    calculate_portfolio_summary,
)

router = APIRouter(prefix="/api/investments", tags=["investments"])


class PriceUpdate(BaseModel):
    """Request schema for updating ticker price."""
    ticker: str
    price: float
    currency: str = "ARS"


class HoldingResponse(BaseModel):
    """Response schema for a single holding."""
    ticker: str
    broker: str
    quantity: float
    avg_cost: float
    current_price: float
    pnl: float
    pnl_percent: float


class HistoryItem(BaseModel):
    """Response schema for a single transaction in history."""
    date: str
    ticker: str
    type: str
    quantity: float
    price: float
    broker: str
    total: float


class SummaryResponse(BaseModel):
    """Response schema for portfolio summary."""
    total_invested: float
    total_current_value: float
    total_unrealized: float
    realized_pnl: float
    total_pnl: float


class UploadResponse(BaseModel):
    """Response schema for CSV upload."""
    ok: bool
    broker: Optional[str]
    fetched: int
    saved: int


class PriceResponse(BaseModel):
    """Response schema for price update."""
    ok: bool
    ticker: str
    price: float


def _is_duplicate_transaction(
    db: Session,
    user_id: int,
    ticker: str,
    broker: str,
    date_: date,
    price: float,
    quantity: float,
) -> bool:
    """Check if transaction already exists (by user, ticker, broker, date, price, qty)."""
    existing = db.query(InvestmentTransaction).filter(
        and_(
            InvestmentTransaction.user_id == user_id,
            InvestmentTransaction.ticker == ticker,
            InvestmentTransaction.broker == broker,
            InvestmentTransaction.date == date_,
            InvestmentTransaction.price == price,
            InvestmentTransaction.quantity == quantity,
        )
    ).first()
    return existing is not None


def _get_or_create_investment(
    db: Session,
    user_id: int,
    ticker: str,
    broker: str,
    purchase_date: date,
) -> Investment:
    """Get or create Investment record."""
    inv = db.query(Investment).filter(
        and_(
            Investment.user_id == user_id,
            Investment.ticker == ticker,
            Investment.broker == broker,
        )
    ).first()
    if not inv:
        inv = Investment(
            user_id=user_id,
            ticker=ticker,
            broker=broker,
            quantity=0.0,
            avg_cost=0.0,
            purchase_date=purchase_date,
            status="open",
        )
        db.add(inv)
        db.flush()
    return inv


def _update_investment_after_buy(
    inv: Investment,
    quantity: float,
    price: float,
) -> None:
    """Update investment quantity and avg_cost after a buy transaction."""
    inv.avg_cost = calculate_weighted_avg_cost(
        inv.quantity,
        inv.avg_cost,
        quantity,
        price,
    )
    inv.quantity += quantity
    if inv.quantity < 0:
        inv.quantity = 0
    if inv.quantity == 0:
        inv.status = "closed"


def _update_investment_after_sell(
    inv: Investment,
    quantity: float,
) -> None:
    """Update investment quantity after a sell transaction."""
    inv.quantity -= quantity
    if inv.quantity < 0:
        inv.quantity = 0
    if inv.quantity == 0:
        inv.status = "closed"


@router.post("/upload", response_model=UploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadResponse:
    """
    Upload CSV from broker.

    - Auto-detects broker format
    - Parses transactions
    - Saves to database (creates Investment & InvestmentTransaction records)
    - Skips duplicates silently

    Returns:
        ok: bool, broker: str (or None), fetched: int, saved: int
    """
    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "File must be CSV format")

    # Validate file size (5MB limit)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 5MB)")

    # Parse CSV
    broker, items = parse_csv(content)
    if broker is None:
        raise HTTPException(400, "CSV format not recognized")

    # Process transactions
    saved_count = 0
    for item in items:
        # Check for duplicates
        if _is_duplicate_transaction(
            db,
            user.id,
            item["ticker"],
            item["broker"],
            date.fromisoformat(item["date"]),
            item["price"],
            item["quantity"],
        ):
            # Silently skip duplicates
            continue

        # Get or create investment
        inv = _get_or_create_investment(
            db,
            user.id,
            item["ticker"],
            item["broker"],
            date.fromisoformat(item["date"]),
        )

        # Update investment based on transaction type
        if item["tx_type"] == "buy":
            _update_investment_after_buy(inv, item["quantity"], item["price"])
        else:  # sell
            _update_investment_after_sell(inv, item["quantity"])

        # Create transaction record
        tx = InvestmentTransaction(
            investment_id=inv.id,
            user_id=user.id,
            broker=item["broker"],
            ticker=item["ticker"],
            tx_type=item["tx_type"],
            quantity=item["quantity"],
            price=item["price"],
            date=date.fromisoformat(item["date"]),
            csv_reference=item.get("csv_reference"),
        )
        db.add(tx)
        saved_count += 1

    # Commit all changes
    db.commit()

    return UploadResponse(
        ok=True,
        broker=broker,
        fetched=len(items),
        saved=saved_count,
    )


@router.get("/holdings", response_model=list[HoldingResponse])
def get_holdings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HoldingResponse]:
    """
    Get current open positions with P&L.

    Returns:
        List of holdings with ticker, broker, quantity, avg_cost, current_price, pnl, pnl_percent
    """
    # Get all open investments
    investments = db.query(Investment).filter(
        and_(
            Investment.user_id == user.id,
            Investment.status == "open",
        )
    ).all()

    holdings = []
    for inv in investments:
        # Get current price from InvestmentPrice table
        price_record = db.query(InvestmentPrice).filter(
            InvestmentPrice.ticker == inv.ticker
        ).first()
        current_price = price_record.price if price_record else 0.0

        # Calculate unrealized P&L
        pnl = calculate_pnl_unrealized(inv.quantity, inv.avg_cost, current_price)
        pnl_percent = (pnl / (inv.quantity * inv.avg_cost) * 100) if (inv.quantity * inv.avg_cost) > 0 else 0.0

        holdings.append(HoldingResponse(
            ticker=inv.ticker,
            broker=inv.broker,
            quantity=inv.quantity,
            avg_cost=inv.avg_cost,
            current_price=current_price,
            pnl=pnl,
            pnl_percent=pnl_percent,
        ))

    # Sort by ticker for consistency
    holdings.sort(key=lambda h: (h.broker, h.ticker))
    return holdings


@router.get("/history", response_model=list[HistoryItem])
def get_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HistoryItem]:
    """
    Get full transaction history (buy/sell, open/closed).

    Returns:
        List of transactions ordered by date descending
    """
    transactions = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).order_by(InvestmentTransaction.date.desc()).all()

    history = []
    for tx in transactions:
        total = tx.quantity * tx.price
        history.append(HistoryItem(
            date=str(tx.date),
            ticker=tx.ticker,
            type=tx.tx_type,
            quantity=tx.quantity,
            price=tx.price,
            broker=tx.broker,
            total=total,
        ))

    return history


@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SummaryResponse:
    """
    Get portfolio P&L summary.

    Returns:
        total_invested, total_current_value, total_unrealized, realized_pnl, total_pnl
    """
    # Get all open investments
    open_investments = db.query(Investment).filter(
        and_(
            Investment.user_id == user.id,
            Investment.status == "open",
        )
    ).all()

    # Build holdings list for calculator
    holdings = []
    for inv in open_investments:
        # Get current price
        price_record = db.query(InvestmentPrice).filter(
            InvestmentPrice.ticker == inv.ticker
        ).first()
        current_price = price_record.price if price_record else 0.0

        holdings.append({
            "quantity": inv.quantity,
            "avg_cost": inv.avg_cost,
            "current_price": current_price,
        })

    # Calculate realized P&L from closed positions
    closed_investments = db.query(Investment).filter(
        and_(
            Investment.user_id == user.id,
            Investment.status == "closed",
        )
    ).all()

    realized_pnl = 0.0
    for inv in closed_investments:
        # Get all transactions for this investment
        buy_txs = db.query(InvestmentTransaction).filter(
            and_(
                InvestmentTransaction.investment_id == inv.id,
                InvestmentTransaction.tx_type == "buy",
            )
        ).all()

        sell_txs = db.query(InvestmentTransaction).filter(
            and_(
                InvestmentTransaction.investment_id == inv.id,
                InvestmentTransaction.tx_type == "sell",
            )
        ).all()

        # Simple realized P&L calculation: (sell_qty * sell_price) - (buy_qty * buy_price)
        total_buy_cost = sum(tx.quantity * tx.price for tx in buy_txs)
        total_sell_value = sum(tx.quantity * tx.price for tx in sell_txs)
        realized_pnl += total_sell_value - total_buy_cost

    # Use calculator to compute summary
    summary = calculate_portfolio_summary(holdings, realized_pnl)

    return SummaryResponse(
        total_invested=summary["total_invested"],
        total_current_value=summary["total_current_value"],
        total_unrealized=summary["total_unrealized"],
        realized_pnl=summary["realized_pnl"],
        total_pnl=summary["total_pnl"],
    )


@router.post("/price", response_model=PriceResponse)
def update_price(
    payload: PriceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PriceResponse:
    """
    Manually update ticker price (MVP).

    Save/update InvestmentPrice record.
    """
    # Get or create price record
    price_record = db.query(InvestmentPrice).filter(
        InvestmentPrice.ticker == payload.ticker
    ).first()

    if not price_record:
        price_record = InvestmentPrice(
            ticker=payload.ticker,
            price=payload.price,
            currency=payload.currency,
        )
        db.add(price_record)
    else:
        price_record.price = payload.price
        price_record.currency = payload.currency

    db.commit()

    return PriceResponse(
        ok=True,
        ticker=payload.ticker,
        price=payload.price,
    )
