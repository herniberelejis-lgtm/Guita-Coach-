"""Precios de mercado para inversiones.

- Cripto: CoinGecko API gratuita (sin API key). Precio en USD.
- Conversión USD→ARS: dólar blue (dolarapi.com).
- Acciones/bonos AR: no hay fuente gratuita confiable; se deja en manos de
  carga manual / último precio conocido (fallback).

Funciones puras de mapeo (sin red) + funciones async de fetch.
"""
from __future__ import annotations

from typing import Iterable, Optional

import httpx

# ── Mapa símbolo → id de CoinGecko (top coins + las del portafolio del usuario) ──
CRYPTO_IDS: dict[str, str] = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "USDT": "tether",
    "USDC": "usd-coin",
    "DAI": "dai",
    "BNB": "binancecoin",
    "XRP": "ripple",
    "ADA": "cardano",
    "SOL": "solana",
    "DOGE": "dogecoin",
    "DOT": "polkadot",
    "MATIC": "matic-network",
    "POL": "matic-network",
    "LTC": "litecoin",
    "SHIB": "shiba-inu",
    "AVAX": "avalanche-2",
    "LINK": "chainlink",
    "ATOM": "cosmos",
    "XLM": "stellar",
    "TRX": "tron",
    "TON": "the-open-network",
    "ALGO": "algorand",
    "ICP": "internet-computer",
    "FET": "fetch-ai",
    "RENDER": "render-token",
    "RNDR": "render-token",
    "PENDLE": "pendle",
    "INJ": "injective-protocol",
    "NEAR": "near",
    "ARB": "arbitrum",
    "OP": "optimism",
    "AAVE": "aave",
    "UNI": "uniswap",
    "SUI": "sui",
    "APT": "aptos",
    "FIL": "filecoin",
    "ETC": "ethereum-classic",
    "BCH": "bitcoin-cash",
    "WLD": "worldcoin-wld",
    "TIA": "celestia",
}

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
DOLAR_URL = "https://dolarapi.com/v1/dolares/blue"


def normalize_ticker(ticker: str) -> str:
    """Limpia un ticker para buscarlo en el mapa de cripto."""
    return (ticker or "").strip().upper()


def is_crypto_ticker(ticker: str) -> bool:
    """True si el ticker está en el mapa de cripto conocido."""
    return normalize_ticker(ticker) in CRYPTO_IDS


def infer_asset_type(ticker: str) -> str:
    """Infiere 'crypto' o 'stock' a partir del ticker."""
    return "crypto" if is_crypto_ticker(ticker) else "stock"


def _coingecko_ids(symbols: Iterable[str]) -> dict[str, str]:
    """Devuelve {símbolo: coingecko_id} sólo para los símbolos conocidos."""
    out: dict[str, str] = {}
    for s in symbols:
        sym = normalize_ticker(s)
        cg_id = CRYPTO_IDS.get(sym)
        if cg_id:
            out[sym] = cg_id
    return out


async def fetch_crypto_prices_usd(symbols: Iterable[str]) -> dict[str, float]:
    """Trae el precio en USD de cada símbolo cripto conocido vía CoinGecko.

    Devuelve {SÍMBOLO: precio_usd}. Símbolos desconocidos o sin precio se omiten.
    Ante error de red devuelve {} (el caller decide el fallback).
    """
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


async def fetch_blue_rate() -> Optional[float]:
    """Trae el dólar blue (venta) para convertir USD→ARS. None ante error."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(DOLAR_URL)
            r.raise_for_status()
            data = r.json()
        venta = data.get("venta")
        return float(venta) if venta else None
    except Exception:
        return None
