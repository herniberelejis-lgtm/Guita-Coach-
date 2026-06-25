"""Investment portfolio endpoints — upload, manual entry, holdings, history, prices, summary.

Soporta acciones/bonos AR (Cocos, IOL, Bull Market) y cripto en una sola vista.
Precios de cripto vía CoinGecko (USD), convertidos a ARS con el dólar blue.
Acciones AR no tienen fuente gratuita confiable: usan último precio conocido
(carga manual) y, en su defecto, el costo promedio como fallback neutro.
"""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..database import get_db
from ..models import User, Investment, InvestmentTransaction, InvestmentPrice
from ..security import get_current_user
from ..services.investment_parser import parse_file
from ..services.investment_calculator import (
    calculate_weighted_avg_cost,
    calculate_concentration_flags,
    calculate_realized_position,
    calculate_diversification_score,
    find_price_at_or_before,
)
from ..services import prices as price_svc

router = APIRouter(prefix="/api/investments", tags=["investments"])


# ─── Schemas ────────────────────────────────────────────────────────────────
class HoldingResponse(BaseModel):
    ticker: str
    broker: str
    asset_type: str
    currency: str
    quantity: float
    avg_cost: float
    current_price: float
    current_value: float
    pnl: float
    pnl_percent: float
    priced: bool


class HistoryItem(BaseModel):
    date: str
    ticker: str
    type: str
    quantity: float
    price: float
    broker: str
    asset_type: str
    total: float


class SummaryResponse(BaseModel):
    total_invested: float
    total_current_value: float
    total_unrealized: float
    realized_pnl: float
    total_pnl: float
    total_buys: float
    total_sells: float
    holdings_count: int
    currency: str
    blue_rate: Optional[float] = None
    by_type: dict = {}
    risk_flags: list[dict] = []
    benchmark: Optional[dict] = None
    diversification_score: Optional[float] = None


class UploadResponse(BaseModel):
    ok: bool
    broker: Optional[str]
    fetched: int
    saved: int


class ManualTxPayload(BaseModel):
    ticker: str
    tx_type: str            # "buy" | "sell"
    quantity: float
    price: float
    date: str               # YYYY-MM-DD
    asset_type: Optional[str] = None   # "crypto" | "stock" (se infiere si falta)
    currency: str = "ARS"
    broker: str = "manual"


class RefreshResponse(BaseModel):
    ok: bool
    updated: int
    blue_rate: Optional[float] = None


class ClosedPositionResponse(BaseModel):
    ticker: str
    broker: str
    asset_type: str
    currency: str
    status: str            # "closed" (vendida del todo) | "open" (venta parcial)
    realized_pnl: float
    realized_pnl_ars: float
    total_bought_qty: float
    total_sold_qty: float
    avg_buy_price: float
    avg_sell_price: float
    first_date: Optional[str]
    last_date: Optional[str]


class TimelinePoint(BaseModel):
    date: str
    market_value: float
    cost_basis: float


class TimelineResponse(BaseModel):
    points: list[TimelinePoint]
    currency: str


class PriceHistoryPoint(BaseModel):
    date: str
    price: float


class TickerDetailResponse(BaseModel):
    ticker: str
    price_history: list[PriceHistoryPoint]
    transactions: list[HistoryItem]
    currency: str


# ─── Helpers de persistencia ──────────────────────────────────────────────
def _is_duplicate_transaction(db, user_id, ticker, broker, date_, price, quantity) -> bool:
    return db.query(InvestmentTransaction).filter(
        and_(
            InvestmentTransaction.user_id == user_id,
            InvestmentTransaction.ticker == ticker,
            InvestmentTransaction.broker == broker,
            InvestmentTransaction.date == date_,
            InvestmentTransaction.price == price,
            InvestmentTransaction.quantity == quantity,
        )
    ).first() is not None


def _get_or_create_investment(db, user_id, ticker, broker, purchase_date, asset_type, currency) -> Investment:
    inv = db.query(Investment).filter(
        and_(
            Investment.user_id == user_id,
            Investment.ticker == ticker,
            Investment.broker == broker,
        )
    ).first()
    if not inv:
        inv = Investment(
            user_id=user_id, ticker=ticker, broker=broker,
            asset_type=asset_type, currency=currency,
            quantity=0.0, avg_cost=0.0, purchase_date=purchase_date, status="open",
        )
        db.add(inv)
        db.flush()
    return inv


def _apply_buy(inv: Investment, quantity: float, price: float) -> None:
    inv.avg_cost = calculate_weighted_avg_cost(inv.quantity, inv.avg_cost, quantity, price)
    inv.quantity += quantity
    if inv.quantity <= 0:
        inv.quantity = 0
        inv.status = "closed"
    else:
        inv.status = "open"


def _apply_sell(inv: Investment, quantity: float) -> None:
    inv.quantity -= quantity
    if inv.quantity <= 0:
        inv.quantity = 0
        inv.status = "closed"


def _record_transaction(db, user_id, item, asset_type, currency) -> None:
    inv = _get_or_create_investment(
        db, user_id, item["ticker"], item["broker"],
        date.fromisoformat(item["date"]), asset_type, currency,
    )
    if item["tx_type"] == "buy":
        _apply_buy(inv, item["quantity"], item["price"])
    else:
        _apply_sell(inv, item["quantity"])
    db.add(InvestmentTransaction(
        investment_id=inv.id, user_id=user_id,
        broker=item["broker"], ticker=item["ticker"],
        asset_type=asset_type, currency=currency,
        tx_type=item["tx_type"], quantity=item["quantity"], price=item["price"],
        date=date.fromisoformat(item["date"]), csv_reference=item.get("csv_reference"),
    ))


# ─── Helpers de cálculo ─────────────────────────────────────────────────────
def _to_ars(amount: float, currency: str, blue: Optional[float]) -> float:
    if currency == "USD" and blue:
        return amount * blue
    return amount


def _current_price(inv: Investment, price_rec: Optional[InvestmentPrice], blue: Optional[float]) -> tuple[float, bool]:
    """Devuelve (precio_actual_en_moneda_de_la_posición, priced)."""
    if price_rec is None:
        return inv.avg_cost, False
    p, pc, ic = price_rec.price, (price_rec.currency or "ARS"), (inv.currency or "ARS")
    if pc == ic:
        return p, True
    if pc == "USD" and ic == "ARS" and blue:
        return p * blue, True
    if pc == "ARS" and ic == "USD" and blue:
        return p / blue, True
    return p, True


def _tx_dicts(txs: list[InvestmentTransaction]) -> list[dict]:
    """Ordena por (fecha, id) y convierte a dicts para las funciones puras del calculator."""
    ordered = sorted(txs, key=lambda t: (t.date, t.id))
    return [{"tx_type": t.tx_type, "quantity": t.quantity, "price": t.price, "date": t.date} for t in ordered]


def _realized_pnl(txs: list[InvestmentTransaction]) -> float:
    """P&L realizado replayando las transacciones con costo promedio ponderado."""
    if not txs:
        return 0.0
    return calculate_realized_position(_tx_dicts(txs))["realized_pnl"]


def _sample_dates(start: date, end: date) -> list[date]:
    """Fechas de muestreo para la línea de tiempo, con resolución acotada según el
    rango total: diaria (<=60d), semanal (<=1 año), mensual (<=3 años), trimestral
    si es más largo. Siempre incluye `end` como último punto."""
    span = (end - start).days
    if span <= 0:
        return [end]
    if span <= 60:
        step = 1
    elif span <= 365:
        step = 7
    elif span <= 365 * 3:
        step = 30
    else:
        step = 90

    dates = []
    d = start
    while d < end:
        dates.append(d)
        d += timedelta(days=step)
    dates.append(end)
    return dates


def _positions_at_date(all_txs: list[InvestmentTransaction], as_of: date) -> dict:
    """Para cada (ticker, broker), qty/avg_cost replayando transacciones hasta `as_of`
    (inclusive), con costo promedio ponderado."""
    positions: dict[tuple, dict] = {}
    for tx in sorted(all_txs, key=lambda t: (t.date, t.id)):
        if tx.date > as_of:
            continue
        key = (tx.ticker, tx.broker)
        pos = positions.setdefault(key, {
            "qty": 0.0, "avg_cost": 0.0,
            "currency": tx.currency or "ARS", "asset_type": tx.asset_type or "stock",
        })
        if tx.tx_type == "buy":
            pos["avg_cost"] = calculate_weighted_avg_cost(pos["qty"], pos["avg_cost"], tx.quantity, tx.price)
            pos["qty"] += tx.quantity
        else:
            pos["qty"] = max(0.0, pos["qty"] - tx.quantity)
    return positions


async def _maybe_blue() -> Optional[float]:
    return await price_svc.fetch_blue_rate()


async def _sync_prices(db: Session, investments: list[Investment], force: bool = False) -> int:
    """Trae precios en tiempo real (Yahoo/CoinGecko, con cache) para las posiciones
    dadas y los persiste en InvestmentPrice. Devuelve cuántos se actualizaron.
    Nunca rompe la carga: ante error de red simplemente no actualiza."""
    from ..config import get_settings
    if not get_settings().live_prices:
        return 0
    specs = [
        {"ticker": inv.ticker, "asset_type": inv.asset_type or "stock",
         "currency": inv.currency or "ARS"}
        for inv in investments if inv.quantity and inv.quantity > 0
    ]
    if not specs:
        return 0
    try:
        quotes = await price_svc.fetch_prices(specs, force=force)
    except Exception:
        return 0

    updated = 0
    for inv in investments:
        q = quotes.get(price_svc.normalize_ticker(inv.ticker))
        if not q:
            continue
        rec = db.query(InvestmentPrice).filter(InvestmentPrice.ticker == inv.ticker).first()
        if rec:
            rec.price, rec.currency, rec.asset_type = q["price"], q["currency"], (inv.asset_type or "stock")
        else:
            db.add(InvestmentPrice(ticker=inv.ticker, price=q["price"],
                                   currency=q["currency"], asset_type=inv.asset_type or "stock"))
        updated += 1
    if updated:
        db.commit()
    return updated


# ─── Endpoints ────────────────────────────────────────────────────────────
@router.post("/upload", response_model=UploadResponse)
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadResponse:
    """Sube CSV/XLSX de un broker, detecta el formato y guarda las transacciones."""
    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx")):
        raise HTTPException(400, "El archivo debe ser CSV o XLSX")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "Archivo muy grande (máximo 5MB)")

    broker, items = parse_file(content, file.filename)
    if broker is None:
        raise HTTPException(400, "Formato de archivo no reconocido")

    saved = 0
    for item in items:
        if _is_duplicate_transaction(
            db, user.id, item["ticker"], item["broker"],
            date.fromisoformat(item["date"]), item["price"], item["quantity"],
        ):
            continue
        asset_type = price_svc.infer_asset_type(item["ticker"])
        _record_transaction(db, user.id, item, asset_type, "ARS")
        saved += 1

    db.commit()
    return UploadResponse(ok=True, broker=broker, fetched=len(items), saved=saved)


@router.post("/manual", response_model=HistoryItem)
def add_manual(
    payload: ManualTxPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HistoryItem:
    """Carga manual de una compra/venta de un activo."""
    if payload.tx_type not in ("buy", "sell"):
        raise HTTPException(400, "tx_type debe ser 'buy' o 'sell'")
    if payload.quantity <= 0 or payload.price <= 0:
        raise HTTPException(400, "Cantidad y precio deben ser mayores a 0")

    ticker = payload.ticker.strip().upper()
    if not ticker:
        raise HTTPException(400, "Ticker requerido")

    asset_type = payload.asset_type or price_svc.infer_asset_type(ticker)
    currency = (payload.currency or "ARS").upper()
    broker = (payload.broker or "manual").strip() or "manual"

    item = {
        "ticker": ticker, "broker": broker, "tx_type": payload.tx_type,
        "quantity": payload.quantity, "price": payload.price, "date": payload.date,
        "csv_reference": f"manual_{payload.date}_{ticker}_{payload.quantity}",
    }
    _record_transaction(db, user.id, item, asset_type, currency)
    db.commit()

    return HistoryItem(
        date=payload.date, ticker=ticker, type=payload.tx_type,
        quantity=payload.quantity, price=payload.price, broker=broker,
        asset_type=asset_type, total=payload.quantity * payload.price,
    )


@router.post("/refresh-prices", response_model=RefreshResponse)
async def refresh_prices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RefreshResponse:
    """Fuerza la actualización en tiempo real de TODOS los activos (acciones AR,
    CEDEARs, US y cripto) vía Yahoo Finance (CoinGecko de fallback)."""
    investments = db.query(Investment).filter(
        and_(Investment.user_id == user.id, Investment.status == "open")
    ).all()
    updated = await _sync_prices(db, investments, force=True)
    blue = await _maybe_blue()
    return RefreshResponse(ok=True, updated=updated, blue_rate=blue)


def _price_map(db, user_id) -> dict:
    recs = db.query(InvestmentPrice).all()
    return {r.ticker: r for r in recs}


@router.get("/holdings", response_model=list[HoldingResponse])
async def get_holdings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HoldingResponse]:
    """Posiciones abiertas con precio actual y P&L no realizado."""
    investments = db.query(Investment).filter(
        and_(Investment.user_id == user.id, Investment.status == "open")
    ).all()
    if not investments:
        return []

    await _sync_prices(db, investments)  # precios en tiempo real (cacheados)
    prices = _price_map(db, user.id)
    needs_blue = any((inv.currency or "ARS") == "ARS" and prices.get(inv.ticker)
                     and (prices[inv.ticker].currency or "ARS") == "USD" for inv in investments)
    blue = await _maybe_blue() if needs_blue else None

    holdings = []
    for inv in investments:
        price, priced = _current_price(inv, prices.get(inv.ticker), blue)
        cost = inv.quantity * inv.avg_cost
        value = inv.quantity * price
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0.0
        holdings.append(HoldingResponse(
            ticker=inv.ticker, broker=inv.broker,
            asset_type=inv.asset_type or "stock", currency=inv.currency or "ARS",
            quantity=inv.quantity, avg_cost=inv.avg_cost, current_price=price,
            current_value=value, pnl=pnl, pnl_percent=pnl_pct, priced=priced,
        ))
    holdings.sort(key=lambda h: h.current_value, reverse=True)
    return holdings


@router.get("/history", response_model=list[HistoryItem])
def get_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HistoryItem]:
    """Historial completo de transacciones (compras/ventas)."""
    txs = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).order_by(InvestmentTransaction.date.desc()).all()
    return [
        HistoryItem(
            date=str(tx.date), ticker=tx.ticker, type=tx.tx_type,
            quantity=tx.quantity, price=tx.price, broker=tx.broker,
            asset_type=tx.asset_type or "stock", total=tx.quantity * tx.price,
        )
        for tx in txs
    ]


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SummaryResponse:
    """Resumen del portafolio en ARS: invertido, valor actual, P&L realizado/no
    realizado, compras y ventas. Convierte posiciones en USD usando el blue."""
    all_invs = db.query(Investment).filter(Investment.user_id == user.id).all()
    all_txs = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).all()

    await _sync_prices(db, [i for i in all_invs if i.status == "open"])  # tiempo real (cacheado)
    prices = _price_map(db, user.id)
    needs_blue = (
        any((t.currency or "ARS") == "USD" for t in all_txs)
        or any((inv.currency or "ARS") == "ARS" and prices.get(inv.ticker)
               and (prices[inv.ticker].currency or "ARS") == "USD" for inv in all_invs)
    )
    blue = await _maybe_blue() if needs_blue else None

    total_invested = total_current_value = realized = 0.0
    total_buys = total_sells = 0.0
    holdings_count = 0
    by_type: dict = {}
    holding_values: list[dict] = []
    has_stock = False

    # Compras / ventas / realizado (sobre todas las transacciones)
    txs_by_inv: dict = {}
    for tx in all_txs:
        txs_by_inv.setdefault(tx.investment_id, []).append(tx)
        amount_ars = _to_ars(tx.quantity * tx.price, tx.currency or "ARS", blue)
        if tx.tx_type == "buy":
            total_buys += amount_ars
        else:
            total_sells += amount_ars

    for inv in all_invs:
        realized += _to_ars(_realized_pnl(txs_by_inv.get(inv.id, [])), inv.currency or "ARS", blue)
        if inv.status == "open" and inv.quantity > 0:
            holdings_count += 1
            price, _ = _current_price(inv, prices.get(inv.ticker), blue)
            cost_ars = _to_ars(inv.quantity * inv.avg_cost, inv.currency or "ARS", blue)
            value_ars = _to_ars(inv.quantity * price, inv.currency or "ARS", blue)
            total_invested += cost_ars
            total_current_value += value_ars
            slot = by_type.setdefault(inv.asset_type or "stock",
                                      {"invested": 0.0, "current_value": 0.0})
            slot["invested"] += cost_ars
            slot["current_value"] += value_ars
            holding_values.append({"ticker": inv.ticker, "current_value": value_ars})
            if (inv.asset_type or "stock") == "stock":
                has_stock = True

    total_unrealized = total_current_value - total_invested
    total_pnl = total_unrealized + realized
    risk_flags = calculate_concentration_flags(holding_values)
    diversification_score = calculate_diversification_score(holding_values)

    benchmark = None
    earliest_tx_date = min((t.date for t in all_txs), default=None)
    if earliest_tx_date and has_stock and total_invested > 0:
        bench_return = await price_svc.fetch_benchmark_return_pct(
            price_svc.BENCHMARK_SYMBOLS["merval"], earliest_tx_date,
        )
        if bench_return is not None:
            benchmark = {
                "name": "MERVAL",
                "portfolio_return_pct": (total_pnl / total_invested) * 100,
                "benchmark_return_pct": bench_return,
                "since": str(earliest_tx_date),
            }

    return SummaryResponse(
        total_invested=total_invested,
        total_current_value=total_current_value,
        total_unrealized=total_unrealized,
        realized_pnl=realized,
        total_pnl=total_pnl,
        total_buys=total_buys,
        total_sells=total_sells,
        holdings_count=holdings_count,
        currency="ARS",
        blue_rate=blue,
        by_type=by_type,
        risk_flags=risk_flags,
        benchmark=benchmark,
        diversification_score=diversification_score,
    )


@router.get("/closed", response_model=list[ClosedPositionResponse])
async def get_closed_positions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ClosedPositionResponse]:
    """Detalle de P&L realizado por posición vendida (total o parcialmente), no
    sólo el agregado de /summary."""
    all_invs = db.query(Investment).filter(Investment.user_id == user.id).all()
    all_txs = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).all()

    txs_by_inv: dict = {}
    for tx in all_txs:
        txs_by_inv.setdefault(tx.investment_id, []).append(tx)

    needs_blue = any(
        (inv.currency or "ARS") == "USD" for inv in all_invs if txs_by_inv.get(inv.id)
    )
    blue = await _maybe_blue() if needs_blue else None

    result = []
    for inv in all_invs:
        txs = txs_by_inv.get(inv.id, [])
        if not any(t.tx_type == "sell" for t in txs):
            continue
        detail = calculate_realized_position(_tx_dicts(txs))
        result.append(ClosedPositionResponse(
            ticker=inv.ticker, broker=inv.broker,
            asset_type=inv.asset_type or "stock", currency=inv.currency or "ARS",
            status=inv.status,
            realized_pnl=detail["realized_pnl"],
            realized_pnl_ars=_to_ars(detail["realized_pnl"], inv.currency or "ARS", blue),
            total_bought_qty=detail["total_bought_qty"],
            total_sold_qty=detail["total_sold_qty"],
            avg_buy_price=detail["avg_buy_price"],
            avg_sell_price=detail["avg_sell_price"],
            first_date=detail["first_date"],
            last_date=detail["last_date"],
        ))
    result.sort(key=lambda r: r.last_date or "", reverse=True)
    return result


@router.get("/timeline", response_model=TimelineResponse)
async def get_timeline(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TimelineResponse:
    """Evolución de la cartera en el tiempo: valor de mercado (mark-to-market con
    precios históricos reales por ticker) y costo invertido acumulado (cost-basis),
    ambos en ARS. Resolución de muestreo acotada según el rango total; cada ticker
    se trae UNA sola vez (no por punto de muestreo)."""
    all_txs = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == user.id
    ).all()
    if not all_txs:
        return TimelineResponse(points=[], currency="ARS")

    start = min(t.date for t in all_txs)
    today = date.today()
    sample_dates = _sample_dates(start, today)

    needs_blue = any((t.currency or "ARS") == "USD" for t in all_txs)
    blue = await _maybe_blue() if needs_blue else None

    tickers = {(t.ticker, t.asset_type or "stock", t.currency or "ARS") for t in all_txs}
    history_by_ticker: dict[str, list[dict]] = {}
    for ticker, asset_type, currency in tickers:
        try:
            history_by_ticker[ticker] = await price_svc.fetch_price_history(
                ticker, asset_type, currency, start
            )
        except Exception:
            history_by_ticker[ticker] = []

    points = []
    for d in sample_dates:
        positions = _positions_at_date(all_txs, d)
        cost_basis = 0.0
        market_value = 0.0
        for (ticker, _broker), pos in positions.items():
            if pos["qty"] <= 0:
                continue
            cost_basis += _to_ars(pos["qty"] * pos["avg_cost"], pos["currency"], blue)
            price = find_price_at_or_before(history_by_ticker.get(ticker, []), d)
            if price is None:
                price = pos["avg_cost"]
            market_value += _to_ars(pos["qty"] * price, pos["currency"], blue)
        points.append(TimelinePoint(date=str(d), market_value=market_value, cost_basis=cost_basis))

    return TimelineResponse(points=points, currency="ARS")


@router.get("/price-history/{ticker}", response_model=TickerDetailResponse)
async def get_ticker_detail(
    ticker: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TickerDetailResponse:
    """Detalle de un activo para el desplegable de la tabla de holdings: histórico
    de precio (Yahoo Finance) + el historial de transacciones propias del usuario
    para ese ticker."""
    ticker = ticker.strip().upper()
    txs = db.query(InvestmentTransaction).filter(
        and_(InvestmentTransaction.user_id == user.id, InvestmentTransaction.ticker == ticker)
    ).order_by(InvestmentTransaction.date.desc()).all()
    if not txs:
        raise HTTPException(404, "No hay transacciones para ese ticker")

    asset_type = txs[0].asset_type or price_svc.infer_asset_type(ticker)
    currency = txs[0].currency or "ARS"
    earliest = min(t.date for t in txs)

    history = await price_svc.fetch_price_history(ticker, asset_type, currency, earliest)

    return TickerDetailResponse(
        ticker=ticker,
        price_history=[
            PriceHistoryPoint(date=str(p["date"]), price=p["price"]) for p in history
        ],
        transactions=[
            HistoryItem(
                date=str(tx.date), ticker=tx.ticker, type=tx.tx_type,
                quantity=tx.quantity, price=tx.price, broker=tx.broker,
                asset_type=tx.asset_type or "stock", total=tx.quantity * tx.price,
            )
            for tx in txs
        ],
        currency=currency,
    )
