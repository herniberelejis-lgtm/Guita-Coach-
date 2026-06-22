"""Precios de mercado para inversiones (tiempo real, fuentes gratuitas sin API key).

Fuente principal: Yahoo Finance (chart endpoint), que cubre en una sola API:
  - Cripto:            TICKER-USD   (ej. BTC-USD)         → USD
  - Acciones/CEDEARs AR: TICKER.BA  (ej. GGAL.BA, AAPL.BA) → ARS (BYMA)
  - Acciones US:       TICKER       (ej. AAPL)            → USD
Fallback cripto: CoinGecko.
Conversión USD→ARS: dólar blue (dolarapi.com).

Cache en memoria por símbolo (TTL corto) para no abusar de las APIs y mantener
los page loads rápidos. `force=True` saltea el cache.
"""
from __future__ import annotations

import asyncio
import time
from typing import Iterable, Optional

import httpx

# ── Mapa símbolo → id de CoinGecko (fallback cripto) ─────────────────────────
CRYPTO_IDS: dict[str, str] = {
    "BTC": "bitcoin", "ETH": "ethereum", "USDT": "tether", "USDC": "usd-coin",
    "DAI": "dai", "BNB": "binancecoin", "XRP": "ripple", "ADA": "cardano",
    "SOL": "solana", "DOGE": "dogecoin", "DOT": "polkadot", "MATIC": "matic-network",
    "POL": "matic-network", "LTC": "litecoin", "SHIB": "shiba-inu", "AVAX": "avalanche-2",
    "LINK": "chainlink", "ATOM": "cosmos", "XLM": "stellar", "TRX": "tron",
    "TON": "the-open-network", "ALGO": "algorand", "ICP": "internet-computer",
    "FET": "fetch-ai", "RENDER": "render-token", "RNDR": "render-token", "PENDLE": "pendle",
    "INJ": "injective-protocol", "NEAR": "near", "ARB": "arbitrum", "OP": "optimism",
    "AAVE": "aave", "UNI": "uniswap", "SUI": "sui", "APT": "aptos", "FIL": "filecoin",
    "ETC": "ethereum-classic", "BCH": "bitcoin-cash", "WLD": "worldcoin-wld", "TIA": "celestia",
}

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
DOLAR_URL = "https://dolarapi.com/v1/dolares/blue"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GuitaCoach/1.0)"}

CACHE_TTL_SECONDS = 180  # 3 minutos

# Cache en memoria: {ticker: {"price": float, "currency": str, "ts": float}}
_QUOTE_CACHE: dict[str, dict] = {}


def normalize_ticker(ticker: str) -> str:
    return (ticker or "").strip().upper()


def is_crypto_ticker(ticker: str) -> bool:
    return normalize_ticker(ticker) in CRYPTO_IDS


def infer_asset_type(ticker: str) -> str:
    return "crypto" if is_crypto_ticker(ticker) else "stock"


def yahoo_symbol(ticker: str, asset_type: str, currency: str) -> str:
    """Construye el símbolo de Yahoo Finance según tipo de activo y moneda.

    - crypto                → TICKER-USD
    - stock en ARS          → TICKER.BA  (BYMA: acciones AR y CEDEARs)
    - stock en USD          → TICKER     (mercado US)
    """
    t = normalize_ticker(ticker)
    if asset_type == "crypto":
        return f"{t}-USD"
    if (currency or "ARS").upper() == "ARS":
        return f"{t}.BA"
    return t


# ── CoinGecko (fallback cripto) ──────────────────────────────────────────────
def _coingecko_ids(symbols: Iterable[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for s in symbols:
        sym = normalize_ticker(s)
        cg_id = CRYPTO_IDS.get(sym)
        if cg_id:
            out[sym] = cg_id
    return out


async def fetch_crypto_prices_usd(symbols: Iterable[str]) -> dict[str, float]:
    """Precio USD de cada símbolo cripto conocido vía CoinGecko. {} ante error."""
    id_map = _coingecko_ids(symbols)
    if not id_map:
        return {}
    ids = ",".join(sorted(set(id_map.values())))
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(COINGECKO_URL, params={"ids": ids, "vs_currencies": "usd"})
            r.raise_for_status()
            data = r.json()
    except Exception:
        return {}
    prices: dict[str, float] = {}
    for sym, cg_id in id_map.items():
        entry = data.get(cg_id)
        if entry and isinstance(entry.get("usd"), (int, float)):
            prices[sym] = float(entry["usd"])
    return prices


# ── Yahoo Finance (fuente principal, todos los activos) ──────────────────────
async def _fetch_yahoo_one(client: httpx.AsyncClient, ticker: str, asset_type: str,
                           currency: str) -> Optional[dict]:
    """Trae {price, currency} de un activo desde Yahoo. None ante error."""
    symbol = yahoo_symbol(ticker, asset_type, currency)
    try:
        r = await client.get(YAHOO_URL.format(symbol=symbol), headers=_YAHOO_HEADERS)
        r.raise_for_status()
        meta = r.json()["chart"]["result"][0]["meta"]
        price = meta.get("regularMarketPrice")
        cur = meta.get("currency") or ("USD" if asset_type == "crypto" else currency)
        if isinstance(price, (int, float)) and price > 0:
            return {"price": float(price), "currency": cur}
    except Exception:
        return None
    return None


async def fetch_prices(specs: list[dict], force: bool = False) -> dict[str, dict]:
    """Precios en tiempo real para una lista de activos.

    specs: [{"ticker": str, "asset_type": str, "currency": str}, ...]
    Devuelve {TICKER: {"price": float, "currency": str}} sólo para los resueltos.

    Usa cache en memoria (TTL CACHE_TTL_SECONDS) salvo force=True. Los activos no
    resueltos por Yahoo se reintentan vía CoinGecko si son cripto.
    """
    now = time.time()
    result: dict[str, dict] = {}
    to_fetch: list[dict] = []

    for spec in specs:
        ticker = normalize_ticker(spec.get("ticker"))
        if not ticker:
            continue
        cached = _QUOTE_CACHE.get(ticker)
        if not force and cached and (now - cached["ts"]) < CACHE_TTL_SECONDS:
            result[ticker] = {"price": cached["price"], "currency": cached["currency"]}
        else:
            to_fetch.append({
                "ticker": ticker,
                "asset_type": spec.get("asset_type") or infer_asset_type(ticker),
                "currency": (spec.get("currency") or "ARS").upper(),
            })

    if not to_fetch:
        return result

    async with httpx.AsyncClient(timeout=10) as client:
        fetched = await asyncio.gather(*[
            _fetch_yahoo_one(client, s["ticker"], s["asset_type"], s["currency"])
            for s in to_fetch
        ], return_exceptions=True)

    # CoinGecko fallback para cripto que Yahoo no resolvió
    crypto_missing = [
        s["ticker"] for s, q in zip(to_fetch, fetched)
        if s["asset_type"] == "crypto" and not (isinstance(q, dict) and q)
    ]
    cg_prices = await fetch_crypto_prices_usd(crypto_missing) if crypto_missing else {}

    for spec, quote in zip(to_fetch, fetched):
        ticker = spec["ticker"]
        q = quote if isinstance(quote, dict) else None
        if not q and ticker in cg_prices:
            q = {"price": cg_prices[ticker], "currency": "USD"}
        if q:
            _QUOTE_CACHE[ticker] = {"price": q["price"], "currency": q["currency"], "ts": now}
            result[ticker] = {"price": q["price"], "currency": q["currency"]}

    return result


BENCHMARK_SYMBOLS = {"merval": "^MERV", "sp500": "SPY"}


async def fetch_benchmark_return_pct(symbol: str, since_date) -> Optional[float]:
    """Retorno % de un benchmark (indice/ETF) entre `since_date` y hoy, via Yahoo
    Finance. None si no se pudo calcular (sin red, simbolo invalido, etc.) —
    nunca rompe el caller."""
    import datetime as _dt
    if isinstance(since_date, str):
        since_date = _dt.date.fromisoformat(since_date)
    period1 = int(_dt.datetime.combine(since_date, _dt.time()).timestamp())
    period2 = int(_dt.datetime.combine(since_date + _dt.timedelta(days=9), _dt.time()).timestamp())
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                YAHOO_URL.format(symbol=symbol),
                headers=_YAHOO_HEADERS,
                params={"period1": period1, "period2": period2, "interval": "1d"},
            )
            r.raise_for_status()
            closes = r.json()["chart"]["result"][0]["indicators"]["quote"][0]["close"]
            start_price = next((c for c in closes if c is not None), None)
            if not start_price:
                return None

            r2 = await client.get(YAHOO_URL.format(symbol=symbol), headers=_YAHOO_HEADERS)
            r2.raise_for_status()
            current_price = r2.json()["chart"]["result"][0]["meta"].get("regularMarketPrice")
            if not current_price:
                return None
    except Exception:
        return None
    return (current_price - start_price) / start_price * 100


async def fetch_blue_rate() -> Optional[float]:
    """Dólar blue (venta) para convertir USD→ARS. None ante error."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(DOLAR_URL)
            r.raise_for_status()
            data = r.json()
        venta = data.get("venta")
        return float(venta) if venta else None
    except Exception:
        return None
