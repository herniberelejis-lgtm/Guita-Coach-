/** Precios de mercado para inversiones (tiempo real, fuentes gratuitas sin API key).
 * Fuente principal: Yahoo Finance (chart endpoint). Fallback cripto: CoinGecko.
 * Conversión USD→ARS: dólar blue (dolarapi.com). Cache en memoria (TTL corto).
 */

export const CRYPTO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  DAI: "dai",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  SOL: "solana",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  POL: "matic-network",
  LTC: "litecoin",
  SHIB: "shiba-inu",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  ATOM: "cosmos",
  XLM: "stellar",
  TRX: "tron",
  TON: "the-open-network",
  ALGO: "algorand",
  ICP: "internet-computer",
  FET: "fetch-ai",
  RENDER: "render-token",
  RNDR: "render-token",
  PENDLE: "pendle",
  INJ: "injective-protocol",
  NEAR: "near",
  ARB: "arbitrum",
  OP: "optimism",
  AAVE: "aave",
  UNI: "uniswap",
  SUI: "sui",
  APT: "aptos",
  FIL: "filecoin",
  ETC: "ethereum-classic",
  BCH: "bitcoin-cash",
  WLD: "worldcoin-wld",
  TIA: "celestia"
};
const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";
const DOLAR_URL = "https://dolarapi.com/v1/dolares/blue";
const YAHOO_URL = symbol => `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; GuitaCoach/1.0)"
};
const CACHE_TTL_MS = 180_000;
const HISTORY_CACHE_TTL_MS = 6 * 3600_000;
const quoteCache = new Map();
const historyCache = new Map();
export function normalizeTicker(ticker) {
  return (ticker || "").trim().toUpperCase();
}
export function isCryptoTicker(ticker) {
  return normalizeTicker(ticker) in CRYPTO_IDS;
}
export function inferAssetType(ticker) {
  return isCryptoTicker(ticker) ? "crypto" : "stock";
}
export function yahooSymbol(ticker, assetType, currency) {
  const t = normalizeTicker(ticker);
  if (assetType === "crypto") return `${t}-USD`;
  if ((currency || "ARS").toUpperCase() === "ARS") return `${t}.BA`;
  return t;
}
async function fetchJson(url, params, headers) {
  const u = new URL(url);
  if (params) Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString(), {
    headers
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export async function fetchCryptoPricesUsd(symbols) {
  const idMap = {};
  for (const s of symbols) {
    const sym = normalizeTicker(s);
    if (CRYPTO_IDS[sym]) idMap[sym] = CRYPTO_IDS[sym];
  }
  if (!Object.keys(idMap).length) return {};
  const ids = [...new Set(Object.values(idMap))].sort().join(",");
  try {
    const data = await fetchJson(COINGECKO_URL, {
      ids,
      vs_currencies: "usd"
    });
    const prices = {};
    for (const [sym, cgId] of Object.entries(idMap)) {
      const entry = data[cgId];
      if (entry && typeof entry.usd === "number") prices[sym] = entry.usd;
    }
    return prices;
  } catch {
    return {};
  }
}
async function fetchYahooOne(ticker, assetType, currency) {
  const symbol = yahooSymbol(ticker, assetType, currency);
  try {
    const data = await fetchJson(YAHOO_URL(symbol), undefined, YAHOO_HEADERS);
    const meta = data.chart.result[0].meta;
    const price = meta.regularMarketPrice;
    const cur = meta.currency || (assetType === "crypto" ? "USD" : currency);
    if (typeof price === "number" && price > 0) return {
      price,
      currency: cur
    };
    return null;
  } catch {
    return null;
  }
}
export async function fetchPrices(specs, force = false) {
  const now = Date.now();
  const result = {};
  const toFetch = [];
  for (const spec of specs) {
    const ticker = normalizeTicker(spec.ticker);
    if (!ticker) continue;
    const cached = quoteCache.get(ticker);
    if (!force && cached && now - cached.ts < CACHE_TTL_MS) {
      result[ticker] = {
        price: cached.price,
        currency: cached.currency
      };
    } else {
      toFetch.push({
        ticker,
        asset_type: spec.asset_type || inferAssetType(ticker),
        currency: (spec.currency || "ARS").toUpperCase()
      });
    }
  }
  if (!toFetch.length) return result;
  const fetched = await Promise.all(toFetch.map(s => fetchYahooOne(s.ticker, s.asset_type, s.currency).catch(() => null)));
  const cryptoMissing = toFetch.filter((s, i) => s.asset_type === "crypto" && !fetched[i]).map(s => s.ticker);
  const cgPrices = cryptoMissing.length ? await fetchCryptoPricesUsd(cryptoMissing) : {};
  toFetch.forEach((spec, i) => {
    let q = fetched[i];
    if (!q && cgPrices[spec.ticker] !== undefined) {
      q = {
        price: cgPrices[spec.ticker],
        currency: "USD"
      };
    }
    if (q) {
      quoteCache.set(spec.ticker, {
        price: q.price,
        currency: q.currency,
        ts: now
      });
      result[spec.ticker] = {
        price: q.price,
        currency: q.currency
      };
    }
  });
  return result;
}
export const BENCHMARK_SYMBOLS = {
  merval: "^MERV",
  sp500: "SPY"
};
export async function fetchBenchmarkReturnPct(symbol, sinceDate) {
  const since = typeof sinceDate === "string" ? new Date(sinceDate + "T00:00:00Z") : sinceDate;
  const period1 = Math.floor(since.getTime() / 1000);
  const period2 = Math.floor((since.getTime() + 9 * 86400000) / 1000);
  try {
    const data = await fetchJson(YAHOO_URL(symbol), {
      period1: String(period1),
      period2: String(period2),
      interval: "1d"
    }, YAHOO_HEADERS);
    const closes = data.chart.result[0].indicators.quote[0].close;
    const startPrice = closes.find(c => c !== null);
    if (!startPrice) return null;
    const data2 = await fetchJson(YAHOO_URL(symbol), undefined, YAHOO_HEADERS);
    const currentPrice = data2.chart.result[0].meta.regularMarketPrice;
    if (!currentPrice) return null;
    return (currentPrice - startPrice) / startPrice * 100;
  } catch {
    return null;
  }
}
export async function fetchPriceHistory(ticker, assetType, currency, since) {
  const sinceDate = typeof since === "string" ? new Date(since + "T00:00:00Z") : since;
  const symbol = yahooSymbol(ticker, assetType, currency);
  const cacheKey = `${symbol}_${sinceDate.toISOString().slice(0, 10)}`;
  const now = Date.now();
  const cached = historyCache.get(cacheKey);
  if (cached && now - cached.ts < HISTORY_CACHE_TTL_MS) return cached.data;
  const period1 = Math.floor(sinceDate.getTime() / 1000);
  const period2 = Math.floor(now / 1000);
  const spanDays = (now - sinceDate.getTime()) / 86400000;
  const interval = spanDays <= 400 ? "1d" : "1wk";
  try {
    const data = await fetchJson(YAHOO_URL(symbol), {
      period1: String(period1),
      period2: String(period2),
      interval
    }, YAHOO_HEADERS);
    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const closes = result.indicators.quote[0].close;
    const points = timestamps.map((ts, i) => ({
      ts,
      close: closes[i]
    })).filter(p => p.close !== null).map(p => ({
      date: new Date(p.ts * 1000).toISOString().slice(0, 10),
      price: Number(p.close)
    }));
    historyCache.set(cacheKey, {
      data: points,
      ts: now
    });
    return points;
  } catch {
    return [];
  }
}
export async function fetchBlueRate() {
  try {
    const data = await fetchJson(DOLAR_URL);
    return data.venta ? Number(data.venta) : null;
  } catch {
    return null;
  }
}
