/** Advanced investment analytics: TIR, win rate, VaR, CVaR, drawdown, correlación, estrés.
 * Funciones puras para análisis de cartera. Sin acceso a DB.
 */

function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}
export function calculateXirr(transactions) {
  if (!transactions || transactions.length < 2) return null;
  const inflows = transactions.filter(t => t.amount > 0).length;
  const outflows = transactions.filter(t => t.amount < 0).length;
  if (inflows === 0 || outflows === 0) return null;
  const refDate = transactions.reduce((min, t) => toDate(t.date) < min ? toDate(t.date) : min, toDate(transactions[0].date));
  function npv(rate) {
    let total = 0;
    for (const tx of transactions) {
      const days = (toDate(tx.date).getTime() - refDate.getTime()) / 86400000;
      const years = days / 365.25;
      total += tx.amount / Math.pow(1 + rate, years);
    }
    return total;
  }
  let low = -0.99;
  let high = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const n = npv(mid);
    if (Math.abs(n) < 0.01) return mid;
    if (n > 0) low = mid;else high = mid;
  }
  return null;
}
export function calculateTradeMetrics(transactions) {
  const empty = {
    win_rate_pct: 0.0,
    profit_factor: 0.0,
    best_trade: null,
    worst_trade: null,
    avg_holding_days: 0
  };
  if (!transactions.length) return empty;
  const buys = transactions.filter(t => t.tx_type === "buy").sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  const sells = transactions.filter(t => t.tx_type === "sell").sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  const trades = [];
  const buyQueue = buys.map(b => ({
    qty: b.quantity,
    price: b.price,
    date: toDate(b.date)
  }));
  for (const sell of sells) {
    let sellQty = sell.quantity;
    const sellPrice = sell.price;
    const sellDate = toDate(sell.date);
    for (const buy of buyQueue) {
      if (buy.qty <= 0) continue;
      const matched = Math.min(buy.qty, sellQty);
      const cost = matched * buy.price;
      const revenue = matched * sellPrice;
      const pnl = revenue - cost;
      const days = Math.round((sellDate.getTime() - buy.date.getTime()) / 86400000);
      trades.push({
        pnl,
        pnl_pct: cost ? pnl / cost * 100 : 0,
        days: Math.max(1, days)
      });
      buy.qty -= matched;
      sellQty -= matched;
      if (sellQty <= 0) break;
    }
  }
  if (!trades.length) return empty;
  const winning = trades.filter(t => t.pnl > 0);
  const losing = trades.filter(t => t.pnl < 0);
  const winRate = winning.length / trades.length * 100;
  let profitFactor = 0;
  if (losing.length) {
    const sumWins = winning.reduce((s, t) => s + t.pnl, 0);
    const sumLoss = Math.abs(losing.reduce((s, t) => s + t.pnl, 0));
    profitFactor = sumLoss > 0 ? sumWins / sumLoss : 0;
  }
  const best = trades.reduce((a, b) => b.pnl > a.pnl ? b : a);
  const worst = trades.reduce((a, b) => b.pnl < a.pnl ? b : a);
  const avgDays = trades.reduce((s, t) => s + t.days, 0) / trades.length;
  return {
    win_rate_pct: Math.round(winRate * 100) / 100,
    profit_factor: Math.round(profitFactor * 100) / 100,
    best_trade: best.pnl_pct,
    worst_trade: worst.pnl_pct,
    avg_holding_days: Math.round(avgDays * 10) / 10
  };
}
export function calculateFiscalSummary(transactions) {
  const byYear = {};
  for (const tx of transactions) {
    if (tx.tx_type !== "sell") continue;
    const year = toDate(tx.date).getFullYear();
    const revenue = tx.quantity * tx.price;
    if (!byYear[year]) byYear[year] = {
      realized_pnl: 0,
      tax_event_count: 0
    };
    byYear[year].realized_pnl += revenue;
    byYear[year].tax_event_count += 1;
  }
  return byYear;
}
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stdev(arr) {
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}
const Z_SCORES = {
  0.95: 1.645,
  0.99: 2.326
};
export function calculateVar(returns, confidence = 0.95, horizonDays = 22) {
  if (!returns.length || returns.length < 2) return null;
  const mu = mean(returns);
  const sigma = stdev(returns);
  const z = Z_SCORES[confidence] ?? 1.645;
  const dailyVar = mu - z * sigma;
  const varHp = dailyVar * Math.sqrt(horizonDays);
  return Math.round(varHp * 100 * 100) / 100;
}
export function calculateCvar(returns, confidence = 0.95, horizonDays = 22) {
  if (!returns.length || returns.length < 2) return null;
  const varVal = calculateVar(returns, confidence, horizonDays);
  if (varVal === null) return null;
  const mu = mean(returns);
  const sigma = stdev(returns);
  const z = Z_SCORES[confidence] ?? 1.645;
  const phiZ = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const cvarDaily = mu - sigma * phiZ / (1 - confidence);
  const cvarHp = cvarDaily * Math.sqrt(horizonDays);
  return Math.round(cvarHp * 100 * 100) / 100;
}
export function calculateDrawdownMetrics(values) {
  if (!values.length || values.length < 2) {
    return {
      max_drawdown_pct: 0.0,
      current_drawdown_pct: 0.0,
      peak_idx: null,
      valley_idx: null
    };
  }
  let maxDd = 0;
  let peak = values[0];
  let peakIdx = 0;
  let valleyIdx = 0;
  values.forEach((val, i) => {
    if (val > peak) {
      peak = val;
      peakIdx = i;
    }
    const dd = peak > 0 ? (peak - val) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
      valleyIdx = i;
    }
  });
  const currentDd = peak > 0 ? (peak - values[values.length - 1]) / peak : 0;
  return {
    max_drawdown_pct: Math.round(maxDd * 100 * 100) / 100,
    current_drawdown_pct: Math.round(currentDd * 100 * 100) / 100,
    peak_idx: peakIdx,
    valley_idx: valleyIdx
  };
}
export function calculateStressScenarios(portfolioValue, scenarios = [-0.2, -0.4, -0.7]) {
  const result = {};
  for (const shock of scenarios) {
    const label = `${Math.round(shock * -100)}%`;
    result[label] = Math.round(portfolioValue * (1 + shock) * 100) / 100;
  }
  return result;
}
export function calculateCorrelationMatrix(priceSeries) {
  const tickers = Object.keys(priceSeries);
  if (tickers.length < 2) return {};
  const returnsSeries = {};
  for (const [ticker, prices] of Object.entries(priceSeries)) {
    if (prices.length < 2) continue;
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(prices[i - 1] !== 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0);
    }
    if (returns.length) returnsSeries[ticker] = returns;
  }
  const validTickers = Object.keys(returnsSeries);
  const correlation = {};
  for (const t1 of validTickers) {
    correlation[t1] = {};
    for (const t2 of validTickers) {
      if (t1 === t2) {
        correlation[t1][t2] = 1.0;
      } else if (correlation[t2]?.[t1] !== undefined) {
        correlation[t1][t2] = correlation[t2][t1];
      } else {
        let r1 = returnsSeries[t1];
        let r2 = returnsSeries[t2];
        const minLen = Math.min(r1.length, r2.length);
        if (minLen < 2) {
          correlation[t1][t2] = 0.0;
          continue;
        }
        r1 = r1.slice(0, minLen);
        r2 = r2.slice(0, minLen);
        const m1 = mean(r1);
        const m2 = mean(r2);
        const dev1 = r1.map(x => x - m1);
        const dev2 = r2.map(x => x - m2);
        const cov = dev1.reduce((s, d1, i) => s + d1 * dev2[i], 0) / r1.length;
        const std1 = r1.length > 1 ? stdev(r1) : 0;
        const std2 = r2.length > 1 ? stdev(r2) : 0;
        correlation[t1][t2] = std1 > 0 && std2 > 0 ? Math.round(Math.max(-1, Math.min(1, cov / (std1 * std2))) * 1000) / 1000 : 0.0;
      }
    }
  }
  return correlation;
}
