/** Investment portfolio P&L calculator. Funciones puras, sin acceso a DB. */

export function calculateWeightedAvgCost(currentQty, currentAvg, newQty, newPrice) {
  const totalQty = currentQty + newQty;
  if (totalQty === 0) return 0.0;
  const totalCost = currentQty * currentAvg + newQty * newPrice;
  return totalCost / totalQty;
}
export function calculatePnlUnrealized(quantity, avgCost, currentPrice) {
  return (currentPrice - avgCost) * quantity;
}
export function calculatePnlRealized(quantitySold, avgCost, sellPrice) {
  return (sellPrice - avgCost) * quantitySold;
}
export function calculateConcentrationFlags(holdings, thresholdPct = 30.0) {
  const total = holdings.reduce((s, h) => s + (h.current_value || 0), 0);
  if (total <= 0) return [];
  const flags = holdings.map(h => ({
    ticker: h.ticker || "",
    pct: (h.current_value || 0) / total * 100
  })).filter(f => f.pct > thresholdPct);
  flags.sort((a, b) => b.pct - a.pct);
  return flags;
}
export function calculateRealizedPosition(transactions) {
  if (!transactions.length) {
    return {
      realized_pnl: 0,
      total_bought_qty: 0,
      total_sold_qty: 0,
      avg_buy_price: 0,
      avg_sell_price: 0,
      first_date: null,
      last_date: null
    };
  }
  const txs = [...transactions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let qty = 0;
  let avg = 0;
  let realized = 0;
  let totalBoughtQty = 0;
  let totalBoughtCost = 0;
  let totalSoldQty = 0;
  let totalSoldRevenue = 0;
  for (const t of txs) {
    if (t.tx_type === "buy") {
      avg = calculateWeightedAvgCost(qty, avg, t.quantity, t.price);
      qty += t.quantity;
      totalBoughtQty += t.quantity;
      totalBoughtCost += t.quantity * t.price;
    } else {
      realized += (t.price - avg) * t.quantity;
      qty = Math.max(0, qty - t.quantity);
      totalSoldQty += t.quantity;
      totalSoldRevenue += t.quantity * t.price;
    }
  }
  return {
    realized_pnl: realized,
    total_bought_qty: totalBoughtQty,
    total_sold_qty: totalSoldQty,
    avg_buy_price: totalBoughtQty ? totalBoughtCost / totalBoughtQty : 0,
    avg_sell_price: totalSoldQty ? totalSoldRevenue / totalSoldQty : 0,
    first_date: String(txs[0].date),
    last_date: String(txs[txs.length - 1].date)
  };
}
export function calculateVolatilityPct(values) {
  const returns = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) returns.push((values[i] - values[i - 1]) / values[i - 1] * 100);
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}
export function calculateMaxDrawdownPct(values) {
  if (values.length < 2) return null;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - v) / peak * 100);
  }
  return maxDd;
}
export function calculateDiversificationScore(holdings) {
  const total = holdings.reduce((s, h) => s + (h.current_value || 0), 0);
  if (total <= 0) return null;
  const n = holdings.length;
  if (n <= 1) return 0.0;
  const hhi = holdings.reduce((s, h) => s + ((h.current_value || 0) / total) ** 2, 0);
  const minHhi = 1.0 / n;
  const score = (1 - hhi) / (1 - minHhi) * 100;
  return Math.max(0.0, Math.min(100.0, score));
}
export function findPriceAtOrBefore(history, targetDate) {
  let result = null;
  for (const point of history) {
    if (point.date <= targetDate) {
      result = point.price;
    } else {
      break;
    }
  }
  return result;
}
export function calculatePortfolioSummary(holdings, realizedPnlTotal = 0.0) {
  let totalInvested = 0;
  let totalCurrentValue = 0;
  for (const h of holdings) {
    totalInvested += h.quantity * h.avg_cost;
    totalCurrentValue += h.quantity * h.current_price;
  }
  const totalUnrealized = totalCurrentValue - totalInvested;
  const totalPnl = totalUnrealized + realizedPnlTotal;
  return {
    total_invested: totalInvested,
    total_current_value: totalCurrentValue,
    total_unrealized: totalUnrealized,
    realized_pnl: realizedPnlTotal,
    total_pnl: totalPnl
  };
}
