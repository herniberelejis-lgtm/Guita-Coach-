/** Investment portfolio endpoints — upload, manual entry, holdings, history, prices,
 * summary, analytics, risk metrics, export y edición de transacciones.
 */
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "@guita-coach/db";
import {
  requireAuth,
  ah,
  HttpError,
  settings,
  calculateWeightedAvgCost,
  calculateConcentrationFlags,
  calculateRealizedPosition,
  calculateDiversificationScore,
  findPriceAtOrBefore,
} from "@guita-coach/shared";
import { parseFile } from "../services/investmentParser.js";
import { calculateXirr, calculateTradeMetrics, calculateFiscalSummary, calculateVar, calculateCvar, calculateDrawdownMetrics, calculateStressScenarios, calculateCorrelationMatrix } from "../services/investmentAnalytics.js";
import * as priceSvc from "../services/prices.js";
export const investmentsRouter = Router();
investmentsRouter.use(requireAuth);
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});
function dstr(d) {
  return typeof d === "string" ? d : d.toISOString().slice(0, 10);
}

// ─── Helpers de persistencia ────────────────────────────────────────────────
async function isDuplicateTransaction(userId, ticker, broker, date, price, quantity) {
  const found = await prisma.investmentTransaction.findFirst({
    where: {
      userId,
      ticker,
      broker,
      date,
      price,
      quantity
    }
  });
  return found !== null;
}
async function getOrCreateInvestment(userId, ticker, broker, purchaseDate, assetType, currency) {
  let inv = await prisma.investment.findFirst({
    where: {
      userId,
      ticker,
      broker
    }
  });
  if (!inv) {
    inv = await prisma.investment.create({
      data: {
        userId,
        ticker,
        broker,
        assetType,
        currency,
        quantity: 0,
        avgCost: 0,
        purchaseDate,
        status: "open"
      }
    });
  }
  return inv;
}
function applyBuy(inv, quantity, price) {
  const avgCost = calculateWeightedAvgCost(inv.quantity, inv.avgCost, quantity, price);
  const newQty = inv.quantity + quantity;
  return newQty <= 0 ? {
    avgCost,
    quantity: 0,
    status: "closed"
  } : {
    avgCost,
    quantity: newQty,
    status: "open"
  };
}
function applySell(inv, quantity) {
  const newQty = inv.quantity - quantity;
  return newQty <= 0 ? {
    quantity: 0,
    status: "closed"
  } : {
    quantity: newQty
  };
}
async function recordTransaction(userId, item, assetType, currency) {
  const date = new Date(item.date + "T00:00:00Z");
  const inv = await getOrCreateInvestment(userId, item.ticker, item.broker, date, assetType, currency);
  const patch = item.tx_type === "buy" ? applyBuy(inv, item.quantity, item.price) : applySell(inv, item.quantity);
  await prisma.investment.update({
    where: {
      id: inv.id
    },
    data: patch
  });
  await prisma.investmentTransaction.create({
    data: {
      investmentId: inv.id,
      userId,
      broker: item.broker,
      ticker: item.ticker,
      assetType,
      currency,
      txType: item.tx_type,
      quantity: item.quantity,
      price: item.price,
      date,
      csvReference: item.csv_reference
    }
  });
}

// ─── Helpers de cálculo ──────────────────────────────────────────────────────
function toArs(amount, currency, blue) {
  if (currency === "USD" && blue) return amount * blue;
  return amount;
}
function currentPrice(inv, priceRec, blue) {
  if (!priceRec) return [inv.avgCost, false];
  const p = priceRec.price;
  const pc = priceRec.currency || "ARS";
  const ic = inv.currency || "ARS";
  if (pc === ic) return [p, true];
  if (pc === "USD" && ic === "ARS" && blue) return [p * blue, true];
  if (pc === "ARS" && ic === "USD" && blue) return [p / blue, true];
  return [p, true];
}
function txDicts(txs) {
  const ordered = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);
  return ordered.map(t => ({
    tx_type: t.txType,
    quantity: t.quantity,
    price: t.price,
    date: dstr(t.date)
  }));
}
function realizedPnl(txs) {
  if (!txs.length) return 0;
  return calculateRealizedPosition(txDicts(txs)).realized_pnl;
}
function sampleDates(start, end) {
  const span = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (span <= 0) return [end];
  let step;
  if (span <= 60) step = 1;else if (span <= 365) step = 7;else if (span <= 365 * 3) step = 30;else step = 90;
  const dates = [];
  let d = new Date(start);
  while (d < end) {
    dates.push(new Date(d));
    d = new Date(d.getTime() + step * 86400000);
  }
  dates.push(end);
  return dates;
}
function positionsAtDate(allTxs, asOf) {
  const positions = new Map();
  const sorted = [...allTxs].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);
  for (const tx of sorted) {
    if (tx.date > asOf) continue;
    const key = `${tx.ticker}__${tx.broker}`;
    let pos = positions.get(key);
    if (!pos) {
      pos = {
        qty: 0,
        avg_cost: 0,
        currency: tx.currency || "ARS",
        asset_type: tx.assetType || "stock"
      };
      positions.set(key, pos);
    }
    if (tx.txType === "buy") {
      pos.avg_cost = calculateWeightedAvgCost(pos.qty, pos.avg_cost, tx.quantity, tx.price);
      pos.qty += tx.quantity;
    } else {
      pos.qty = Math.max(0, pos.qty - tx.quantity);
    }
  }
  return positions;
}
async function maybeBlue() {
  return priceSvc.fetchBlueRate();
}
async function syncPrices(investments, force = false) {
  if (!settings.livePrices) return 0;
  const specs = investments.filter(inv => inv.quantity && inv.quantity > 0).map(inv => ({
    ticker: inv.ticker,
    asset_type: inv.assetType || "stock",
    currency: inv.currency || "ARS"
  }));
  if (!specs.length) return 0;
  let quotes;
  try {
    quotes = await priceSvc.fetchPrices(specs, force);
  } catch {
    return 0;
  }
  let updated = 0;
  for (const inv of investments) {
    const q = quotes[priceSvc.normalizeTicker(inv.ticker)];
    if (!q) continue;
    const rec = await prisma.investmentPrice.findUnique({
      where: {
        ticker: inv.ticker
      }
    });
    if (rec) {
      await prisma.investmentPrice.update({
        where: {
          id: rec.id
        },
        data: {
          price: q.price,
          currency: q.currency,
          assetType: inv.assetType || "stock"
        }
      });
    } else {
      await prisma.investmentPrice.create({
        data: {
          ticker: inv.ticker,
          price: q.price,
          currency: q.currency,
          assetType: inv.assetType || "stock"
        }
      });
    }
    updated += 1;
  }
  return updated;
}
async function priceMap() {
  const recs = await prisma.investmentPrice.findMany();
  return new Map(recs.map(r => [r.ticker, r]));
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

investmentsRouter.post("/upload", upload.single("file"), ah(async (req, res) => {
  const user = req.user;
  const file = req.file;
  if (!file || !(file.originalname.endsWith(".csv") || file.originalname.endsWith(".xlsx"))) {
    throw new HttpError(400, "El archivo debe ser CSV o XLSX");
  }
  if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "Archivo muy grande (máximo 5MB)");
  const [broker, items] = parseFile(file.buffer, file.originalname);
  if (broker === null) throw new HttpError(400, "Formato de archivo no reconocido");
  let saved = 0;
  for (const item of items) {
    const date = new Date(item.date + "T00:00:00Z");
    if (await isDuplicateTransaction(user.id, item.ticker, item.broker, date, item.price, item.quantity)) continue;
    const assetType = priceSvc.inferAssetType(item.ticker);
    await recordTransaction(user.id, item, assetType, "ARS");
    saved += 1;
  }
  res.json({
    ok: true,
    broker,
    fetched: items.length,
    saved
  });
}));
const ManualTxSchema = z.object({
  ticker: z.string(),
  tx_type: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  price: z.number().positive(),
  date: z.string(),
  asset_type: z.string().nullable().optional(),
  currency: z.string().default("ARS"),
  broker: z.string().default("manual")
});
investmentsRouter.post("/manual", ah(async (req, res) => {
  const user = req.user;
  const payload = ManualTxSchema.parse(req.body);
  const ticker = payload.ticker.trim().toUpperCase();
  if (!ticker) throw new HttpError(400, "Ticker requerido");
  const assetType = payload.asset_type || priceSvc.inferAssetType(ticker);
  const currency = (payload.currency || "ARS").toUpperCase();
  const broker = (payload.broker || "manual").trim() || "manual";
  const item = {
    ticker,
    broker,
    tx_type: payload.tx_type,
    quantity: payload.quantity,
    price: payload.price,
    date: payload.date,
    csv_reference: `manual_${payload.date}_${ticker}_${payload.quantity}`
  };
  await recordTransaction(user.id, item, assetType, currency);
  res.json({
    date: payload.date,
    ticker,
    type: payload.tx_type,
    quantity: payload.quantity,
    price: payload.price,
    broker,
    asset_type: assetType,
    total: payload.quantity * payload.price
  });
}));
investmentsRouter.post("/refresh-prices", ah(async (req, res) => {
  const investments = await prisma.investment.findMany({
    where: {
      userId: req.user.id,
      status: "open"
    }
  });
  const updated = await syncPrices(investments, true);
  const blue = await maybeBlue();
  res.json({
    ok: true,
    updated,
    blue_rate: blue
  });
}));
investmentsRouter.get("/holdings", ah(async (req, res) => {
  const investments = await prisma.investment.findMany({
    where: {
      userId: req.user.id,
      status: "open"
    }
  });
  if (!investments.length) {
    res.json([]);
    return;
  }
  await syncPrices(investments);
  const prices = await priceMap();
  const needsBlue = investments.some(inv => (inv.currency || "ARS") === "ARS" && prices.get(inv.ticker) && (prices.get(inv.ticker).currency || "ARS") === "USD");
  const blue = needsBlue ? await maybeBlue() : null;
  const holdings = investments.map(inv => {
    const [price, priced] = currentPrice(inv, prices.get(inv.ticker), blue);
    const cost = inv.quantity * inv.avgCost;
    const value = inv.quantity * price;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
    return {
      ticker: inv.ticker,
      broker: inv.broker,
      asset_type: inv.assetType || "stock",
      currency: inv.currency || "ARS",
      quantity: inv.quantity,
      avg_cost: inv.avgCost,
      current_price: price,
      current_value: value,
      pnl,
      pnl_percent: pnlPct,
      priced
    };
  });
  holdings.sort((a, b) => b.current_value - a.current_value);
  res.json(holdings);
}));
investmentsRouter.get("/history", ah(async (req, res) => {
  const txs = await prisma.investmentTransaction.findMany({
    where: {
      userId: req.user.id
    },
    orderBy: {
      date: "desc"
    }
  });
  res.json(txs.map(tx => ({
    date: dstr(tx.date),
    ticker: tx.ticker,
    type: tx.txType,
    quantity: tx.quantity,
    price: tx.price,
    broker: tx.broker,
    asset_type: tx.assetType || "stock",
    total: tx.quantity * tx.price
  })));
}));
investmentsRouter.get("/summary", ah(async (req, res) => {
  const user = req.user;
  const allInvs = await prisma.investment.findMany({
    where: {
      userId: user.id
    }
  });
  const allTxs = await prisma.investmentTransaction.findMany({
    where: {
      userId: user.id
    }
  });
  await syncPrices(allInvs.filter(i => i.status === "open"));
  const prices = await priceMap();
  const needsBlue = allTxs.some(t => (t.currency || "ARS") === "USD") || allInvs.some(inv => (inv.currency || "ARS") === "ARS" && prices.get(inv.ticker) && (prices.get(inv.ticker).currency || "ARS") === "USD");
  const blue = needsBlue ? await maybeBlue() : null;
  let totalInvested = 0;
  let totalCurrentValue = 0;
  let realized = 0;
  let totalBuys = 0;
  let totalSells = 0;
  let holdingsCount = 0;
  const byType = {};
  const holdingValues = [];
  let hasStock = false;
  const txsByInv = new Map();
  for (const tx of allTxs) {
    const key = tx.investmentId ?? -1;
    if (!txsByInv.has(key)) txsByInv.set(key, []);
    txsByInv.get(key).push(tx);
    const amountArs = toArs(tx.quantity * tx.price, tx.currency || "ARS", blue);
    if (tx.txType === "buy") totalBuys += amountArs;else totalSells += amountArs;
  }
  for (const inv of allInvs) {
    realized += toArs(realizedPnl(txsByInv.get(inv.id) || []), inv.currency || "ARS", blue);
    if (inv.status === "open" && inv.quantity > 0) {
      holdingsCount += 1;
      const [price] = currentPrice(inv, prices.get(inv.ticker), blue);
      const costArs = toArs(inv.quantity * inv.avgCost, inv.currency || "ARS", blue);
      const valueArs = toArs(inv.quantity * price, inv.currency || "ARS", blue);
      totalInvested += costArs;
      totalCurrentValue += valueArs;
      const type = inv.assetType || "stock";
      if (!byType[type]) byType[type] = {
        invested: 0,
        current_value: 0
      };
      byType[type].invested += costArs;
      byType[type].current_value += valueArs;
      holdingValues.push({
        ticker: inv.ticker,
        current_value: valueArs
      });
      if (type === "stock") hasStock = true;
    }
  }
  const totalUnrealized = totalCurrentValue - totalInvested;
  const totalPnl = totalUnrealized + realized;
  const riskFlags = calculateConcentrationFlags(holdingValues);
  const diversificationScore = calculateDiversificationScore(holdingValues);
  let benchmark = null;
  const earliestTxDate = allTxs.length ? allTxs.reduce((min, t) => t.date < min ? t.date : min, allTxs[0].date) : null;
  if (earliestTxDate && hasStock && totalInvested > 0) {
    const benchReturn = await priceSvc.fetchBenchmarkReturnPct(priceSvc.BENCHMARK_SYMBOLS.merval, earliestTxDate);
    if (benchReturn !== null) {
      benchmark = {
        name: "MERVAL",
        portfolio_return_pct: totalPnl / totalInvested * 100,
        benchmark_return_pct: benchReturn,
        since: dstr(earliestTxDate)
      };
    }
  }
  res.json({
    total_invested: totalInvested,
    total_current_value: totalCurrentValue,
    total_unrealized: totalUnrealized,
    realized_pnl: realized,
    total_pnl: totalPnl,
    total_buys: totalBuys,
    total_sells: totalSells,
    holdings_count: holdingsCount,
    currency: "ARS",
    blue_rate: blue,
    by_type: byType,
    risk_flags: riskFlags,
    benchmark,
    diversification_score: diversificationScore
  });
}));
investmentsRouter.get("/closed", ah(async (req, res) => {
  const user = req.user;
  const allInvs = await prisma.investment.findMany({
    where: {
      userId: user.id
    }
  });
  const allTxs = await prisma.investmentTransaction.findMany({
    where: {
      userId: user.id
    }
  });
  const txsByInv = new Map();
  for (const tx of allTxs) {
    const key = tx.investmentId ?? -1;
    if (!txsByInv.has(key)) txsByInv.set(key, []);
    txsByInv.get(key).push(tx);
  }
  const needsBlue = allInvs.some(inv => (inv.currency || "ARS") === "USD" && (txsByInv.get(inv.id) || []).length);
  const blue = needsBlue ? await maybeBlue() : null;
  const result = [];
  for (const inv of allInvs) {
    const txs = txsByInv.get(inv.id) || [];
    if (!txs.some(t => t.txType === "sell")) continue;
    const detail = calculateRealizedPosition(txDicts(txs));
    result.push({
      ticker: inv.ticker,
      broker: inv.broker,
      asset_type: inv.assetType || "stock",
      currency: inv.currency || "ARS",
      status: inv.status,
      realized_pnl: detail.realized_pnl,
      realized_pnl_ars: toArs(detail.realized_pnl, inv.currency || "ARS", blue),
      total_bought_qty: detail.total_bought_qty,
      total_sold_qty: detail.total_sold_qty,
      avg_buy_price: detail.avg_buy_price,
      avg_sell_price: detail.avg_sell_price,
      first_date: detail.first_date,
      last_date: detail.last_date
    });
  }
  result.sort((a, b) => (b.last_date || "").localeCompare(a.last_date || ""));
  res.json(result);
}));
investmentsRouter.get("/timeline", ah(async (req, res) => {
  const allTxs = await prisma.investmentTransaction.findMany({
    where: {
      userId: req.user.id
    }
  });
  if (!allTxs.length) {
    res.json({
      points: [],
      currency: "ARS"
    });
    return;
  }
  const start = allTxs.reduce((min, t) => t.date < min ? t.date : min, allTxs[0].date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sd = sampleDates(start, today);
  const needsBlue = allTxs.some(t => (t.currency || "ARS") === "USD");
  const blue = needsBlue ? await maybeBlue() : null;
  const tickers = new Set();
  const tickerMeta = new Map();
  for (const t of allTxs) {
    tickers.add(t.ticker);
    tickerMeta.set(t.ticker, {
      asset_type: t.assetType || "stock",
      currency: t.currency || "ARS"
    });
  }
  const historyByTicker = new Map();
  for (const ticker of tickers) {
    const meta = tickerMeta.get(ticker);
    try {
      historyByTicker.set(ticker, await priceSvc.fetchPriceHistory(ticker, meta.asset_type, meta.currency, start));
    } catch {
      historyByTicker.set(ticker, []);
    }
  }
  const points = sd.map(d => {
    const positions = positionsAtDate(allTxs, d);
    let costBasis = 0;
    let marketValue = 0;
    for (const [key, pos] of positions) {
      if (pos.qty <= 0) continue;
      const ticker = key.split("__")[0];
      costBasis += toArs(pos.qty * pos.avg_cost, pos.currency, blue);
      const price = findPriceAtOrBefore(historyByTicker.get(ticker) || [], dstr(d)) ?? pos.avg_cost;
      marketValue += toArs(pos.qty * price, pos.currency, blue);
    }
    return {
      date: dstr(d),
      market_value: marketValue,
      cost_basis: costBasis
    };
  });
  res.json({
    points,
    currency: "ARS"
  });
}));
investmentsRouter.get("/price-history/:ticker", ah(async (req, res) => {
  const user = req.user;
  const ticker = req.params.ticker.trim().toUpperCase();
  const txs = await prisma.investmentTransaction.findMany({
    where: {
      userId: user.id,
      ticker
    },
    orderBy: {
      date: "desc"
    }
  });
  if (!txs.length) throw new HttpError(404, "No hay transacciones para ese ticker");
  const assetType = txs[0].assetType || priceSvc.inferAssetType(ticker);
  const currency = txs[0].currency || "ARS";
  const earliest = txs.reduce((min, t) => t.date < min ? t.date : min, txs[0].date);
  const history = await priceSvc.fetchPriceHistory(ticker, assetType, currency, earliest);
  res.json({
    ticker,
    price_history: history.map(p => ({
      date: p.date,
      price: p.price
    })),
    transactions: txs.map(tx => ({
      date: dstr(tx.date),
      ticker: tx.ticker,
      type: tx.txType,
      quantity: tx.quantity,
      price: tx.price,
      broker: tx.broker,
      asset_type: tx.assetType || "stock",
      total: tx.quantity * tx.price
    })),
    currency
  });
}));

// ─── Analytics / risk / history-v2 / export / edición ───────────────────────

investmentsRouter.get("/analytics", ah(async (req, res) => {
  const txs = await prisma.investmentTransaction.findMany({
    where: {
      userId: req.user.id
    },
    orderBy: {
      date: "asc"
    }
  });
  if (!txs.length) {
    res.json({
      xirr_pct: null,
      win_rate_pct: 0.0,
      profit_factor: 0.0,
      best_trade_pct: null,
      worst_trade_pct: null,
      avg_holding_days: 0,
      fiscal_summary: {}
    });
    return;
  }
  const xirrTxs = txs.map(tx => ({
    date: tx.date,
    amount: tx.txType === "buy" ? -tx.quantity * tx.price : tx.quantity * tx.price
  }));
  const xirr = calculateXirr(xirrTxs);
  const tradeInput = txs.map(tx => ({
    tx_type: tx.txType,
    quantity: tx.quantity,
    price: tx.price,
    date: tx.date
  }));
  const tradeMetrics = calculateTradeMetrics(tradeInput);
  const fiscal = calculateFiscalSummary(tradeInput);
  res.json({
    xirr_pct: xirr !== null ? Math.round(xirr * 10000) / 100 : null,
    win_rate_pct: tradeMetrics.win_rate_pct,
    profit_factor: tradeMetrics.profit_factor,
    best_trade_pct: tradeMetrics.best_trade,
    worst_trade_pct: tradeMetrics.worst_trade,
    avg_holding_days: tradeMetrics.avg_holding_days,
    fiscal_summary: Object.fromEntries(Object.entries(fiscal).map(([year, val]) => [String(year), val]))
  });
}));
investmentsRouter.get("/risk-metrics", ah(async (req, res) => {
  const txs = await prisma.investmentTransaction.findMany({
    where: {
      userId: req.user.id
    },
    orderBy: {
      date: "asc"
    }
  });
  if (!txs.length) {
    res.json({
      var_95_pct: null,
      var_99_pct: null,
      cvar_95_pct: null,
      cvar_99_pct: null,
      max_drawdown_pct: 0.0,
      current_drawdown_pct: 0.0,
      stress_scenarios: {},
      correlation: {}
    });
    return;
  }
  const byTicker = new Map();
  for (const tx of txs) {
    if (!byTicker.has(tx.ticker)) byTicker.set(tx.ticker, []);
    byTicker.get(tx.ticker).push(tx.price);
  }
  const returns = [];
  for (const prices of byTicker.values()) {
    for (let i = 1; i < prices.length; i++) {
      returns.push(prices[i - 1] !== 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0);
    }
  }
  const var95 = returns.length ? calculateVar(returns, 0.95) : null;
  const var99 = returns.length ? calculateVar(returns, 0.99) : null;
  const cvar95 = returns.length ? calculateCvar(returns, 0.95) : null;
  const cvar99 = returns.length ? calculateCvar(returns, 0.99) : null;
  const holdingsByDate = new Map();
  for (const tx of txs) {
    const key = dstr(tx.date);
    holdingsByDate.set(key, (holdingsByDate.get(key) || 0) + tx.quantity * tx.price);
  }
  const values = [...holdingsByDate.values()];
  const ddMetrics = calculateDrawdownMetrics(values);
  const currentHoldings = new Map();
  for (const tx of txs) {
    const delta = tx.txType === "buy" ? tx.quantity : -tx.quantity;
    currentHoldings.set(tx.ticker, (currentHoldings.get(tx.ticker) || 0) + delta);
  }
  const currentValue = txs.length ? txs.filter(tx => currentHoldings.has(tx.ticker)).reduce((s, tx) => s + tx.quantity * tx.price, 0) / txs.length * currentHoldings.size : 0;
  const stress = currentValue ? calculateStressScenarios(currentValue) : {};
  const correlation = calculateCorrelationMatrix(Object.fromEntries(byTicker));
  res.json({
    var_95_pct: var95,
    var_99_pct: var99,
    cvar_95_pct: cvar95,
    cvar_99_pct: cvar99,
    max_drawdown_pct: ddMetrics.max_drawdown_pct,
    current_drawdown_pct: ddMetrics.current_drawdown_pct,
    stress_scenarios: stress,
    correlation
  });
}));
investmentsRouter.get("/history-v2", ah(async (req, res) => {
  const user = req.user;
  const {
    ticker,
    tx_type,
    date_from,
    date_to,
    currency,
    search
  } = req.query;
  const where = {
    userId: user.id
  };
  if (ticker) where.ticker = ticker.toUpperCase();
  if (tx_type) where.txType = tx_type.toLowerCase();
  if (date_from) {
    const d = new Date(date_from);
    if (!Number.isNaN(d.getTime())) where.date = {
      ...(where.date || {}),
      gte: d
    };
  }
  if (date_to) {
    const d = new Date(date_to);
    if (!Number.isNaN(d.getTime())) where.date = {
      ...(where.date || {}),
      lte: d
    };
  }
  if (currency) where.currency = currency.toUpperCase();
  let txs = await prisma.investmentTransaction.findMany({
    where,
    orderBy: {
      date: "desc"
    }
  });
  if (search) {
    const s = search.toLowerCase();
    txs = txs.filter(t => (t.ticker || "").toLowerCase().includes(s) || (t.broker || "").toLowerCase().includes(s));
  }
  res.json(txs.map(t => ({
    id: t.id,
    ticker: t.ticker,
    tx_type: t.txType,
    quantity: t.quantity,
    price: t.price,
    date: dstr(t.date),
    currency: t.currency,
    broker: t.broker,
    csv_reference: t.csvReference
  })));
}));
investmentsRouter.get("/export-csv", ah(async (req, res) => {
  const user = req.user;
  const {
    ticker,
    tx_type,
    date_from,
    date_to,
    currency
  } = req.query;
  const where = {
    userId: user.id
  };
  if (ticker) where.ticker = ticker.toUpperCase();
  if (tx_type) where.txType = tx_type.toLowerCase();
  if (date_from) {
    const d = new Date(date_from);
    if (!Number.isNaN(d.getTime())) where.date = {
      ...(where.date || {}),
      gte: d
    };
  }
  if (date_to) {
    const d = new Date(date_to);
    if (!Number.isNaN(d.getTime())) where.date = {
      ...(where.date || {}),
      lte: d
    };
  }
  if (currency) where.currency = currency.toUpperCase();
  const txs = await prisma.investmentTransaction.findMany({
    where,
    orderBy: {
      date: "asc"
    }
  });
  const header = ["Fecha", "Ticker", "Tipo", "Cantidad", "Precio", "Moneda", "Broker", "Referencia CSV"];
  const rows = txs.map(t => [dstr(t.date), t.ticker, t.txType.toUpperCase(), t.quantity, t.price, t.currency, t.broker || "", t.csvReference || ""].join(","));
  const csv = "\uFEFF" + [header.join(","), ...rows].join("\n");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  res.json({
    csv,
    filename: `inversiones_${stamp}.csv`
  });
}));
investmentsRouter.patch("/transaction/:txId", ah(async (req, res) => {
  const user = req.user;
  const tx = await prisma.investmentTransaction.findFirst({
    where: {
      id: Number(req.params.txId),
      userId: user.id
    }
  });
  if (!tx) throw new HttpError(404, "Transacción no encontrada");
  const data = {};
  if (req.body.quantity !== undefined) data.quantity = Number(req.body.quantity);
  if (req.body.price !== undefined) data.price = Number(req.body.price);
  if (req.body.date !== undefined) {
    const d = new Date(req.body.date);
    if (!Number.isNaN(d.getTime())) data.date = d;
  }
  const updated = await prisma.investmentTransaction.update({
    where: {
      id: tx.id
    },
    data
  });
  res.json({
    id: updated.id,
    ticker: updated.ticker,
    tx_type: updated.txType,
    quantity: updated.quantity,
    price: updated.price,
    date: dstr(updated.date)
  });
}));
investmentsRouter.delete("/transaction/:txId", ah(async (req, res) => {
  const tx = await prisma.investmentTransaction.findFirst({
    where: {
      id: Number(req.params.txId),
      userId: req.user.id
    }
  });
  if (!tx) throw new HttpError(404, "Transacción no encontrada");
  await prisma.investmentTransaction.delete({
    where: {
      id: tx.id
    }
  });
  res.json({
    ok: true
  });
}));
