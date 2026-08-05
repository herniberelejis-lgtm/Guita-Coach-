/** Insights — proyecciones, velocidad, resumen mensual. */
import { Router } from "express";
import { prisma } from "@guita-coach/db";
import {
  requireAuth,
  ah,
  expenseAmount,
  reimbursementMap,
  calculatePortfolioSummary,
  daysInMonth,
  METHOD_LABELS,
} from "@guita-coach/shared";
export const insightsRouter = Router();
let dolarCache = {
  at: null,
  data: null
};
insightsRouter.get("/dolar", ah(async (_req, res) => {
  const now = Date.now();
  if (dolarCache.at && now - dolarCache.at < 10 * 60 * 1000) {
    res.json(dolarCache.data);
    return;
  }
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = await r.json();
    const rates = {};
    for (const d of list) rates[d.casa] = d;
    const data = {
      blue: {
        compra: rates.blue?.compra,
        venta: rates.blue?.venta
      },
      oficial: {
        compra: rates.oficial?.compra,
        venta: rates.oficial?.venta
      },
      updated_at: new Date(now).toISOString()
    };
    dolarCache = {
      at: now,
      data
    };
    res.json(data);
  } catch {
    if (dolarCache.data) {
      res.json(dolarCache.data);
    } else {
      res.json({
        blue: null,
        oficial: null,
        error: "Cotización no disponible"
      });
    }
  }
}));
insightsRouter.use(requireAuth);
function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
insightsRouter.get("/categories", ah(async (req, res) => {
  const user = req.user;
  const month = req.query.month ? String(req.query.month) : currentMonthStr();
  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      month,
      txType: "expense",
      isInternalTransfer: false,
      isDuplicate: false,
      status: {
        in: ["confirmed", "classified"]
      }
    }
  });
  const reimb = await reimbursementMap(user.id);
  const byCat = {};
  const fallback = {
    necesidades: "Otras necesidades",
    gustos: "Otros gustos",
    ahorro: "Ahorro"
  };
  for (const t of txs) {
    const key = (t.subcategory || "").trim() || fallback[t.category || ""] || "Pendiente de categoría";
    if (!byCat[key]) byCat[key] = {
      amount: 0,
      count: 0,
      franja: t.category
    };
    byCat[key].amount += expenseAmount(t, reimb);
    byCat[key].count += 1;
  }
  const total = Object.values(byCat).reduce((s, e) => s + e.amount, 0);
  const items = Object.entries(byCat).map(([name, v]) => ({
    name,
    ...v,
    pct: total ? Math.round(v.amount / total * 1000) / 10 : 0
  })).sort((a, b) => b.amount - a.amount);
  res.json({
    month,
    total,
    categories: items
  });
}));
insightsRouter.get("/payment-methods", ah(async (req, res) => {
  const user = req.user;
  const month = req.query.month ? String(req.query.month) : currentMonthStr();
  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      month,
      txType: "expense",
      isInternalTransfer: false,
      isDuplicate: false,
      status: {
        in: ["confirmed", "classified"]
      }
    }
  });
  const reimb = await reimbursementMap(user.id);
  const byMethod = {};
  for (const t of txs) {
    let method = (t.paymentMethod || "").trim() || "otro";
    if (!(method in METHOD_LABELS)) method = "otro";
    if (!byMethod[method]) byMethod[method] = {
      amount: 0,
      count: 0
    };
    byMethod[method].amount += expenseAmount(t, reimb);
    byMethod[method].count += 1;
  }
  const total = Object.values(byMethod).reduce((s, e) => s + e.amount, 0);
  const items = Object.entries(byMethod).map(([method, v]) => ({
    method,
    label: METHOD_LABELS[method] || method,
    amount: v.amount,
    count: v.count,
    pct: total ? Math.round(v.amount / total * 1000) / 10 : 0
  })).sort((a, b) => b.amount - a.amount);
  res.json({
    month,
    total,
    methods: items
  });
}));
insightsRouter.get("/month", ah(async (req, res) => {
  const user = req.user;
  const now = new Date();
  const month = currentMonthStr();
  const reimb = await reimbursementMap(user.id);
  const isVariable = Boolean(user.incomeIsVariable);
  const days = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const daysPassed = now.getDate();
  const daysRemaining = days - daysPassed;
  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      month,
      status: {
        in: ["confirmed", "classified"]
      }
    }
  });
  const visible = txs.filter(t => !t.isInternalTransfer && !t.isDuplicate);
  const expenseTxs = visible.filter(t => (t.txType || "expense") === "expense");
  const trackedIncome = visible.filter(t => (t.txType || "expense") === "income" && !t.isReimbursement).reduce((s, t) => s + (t.amount ?? 0), 0);
  const declaredIncome = user.monthlyIncome ?? 0;
  const income = isVariable ? trackedIncome : Math.max(trackedIncome, declaredIncome);
  if (income <= 0 && expenseTxs.length === 0) {
    res.json({
      error: "Configurá tu ingreso primero"
    });
    return;
  }
  const limits = {
    necesidades: income * user.necesidadesPct / 100,
    gustos: income * user.gustosPct / 100,
    ahorro: income * user.ahorroPct / 100
  };
  const dr = Math.max(daysRemaining, 1);
  const franjas = Object.entries(limits).map(([cat, limit]) => {
    const catTxs = expenseTxs.filter(t => t.category === cat);
    const spent = catTxs.reduce((s, t) => s + expenseAmount(t, reimb), 0);
    const remaining = Math.max(0, limit - spent);
    const dailyRate = daysPassed > 0 ? spent / daysPassed : 0;
    const projection = spent + dailyRate * daysRemaining;
    const topMerchants = {};
    for (const t of catTxs) {
      if (t.merchant) topMerchants[t.merchant] = (topMerchants[t.merchant] || 0) + expenseAmount(t, reimb);
    }
    const top = Object.entries(topMerchants).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      category: cat,
      spent,
      limit,
      remaining,
      usage_pct: limit > 0 ? Math.round(spent / limit * 1000) / 10 : 0,
      daily_rate: Math.round(dailyRate),
      projected_total: Math.round(projection),
      will_exceed: projection > limit,
      top_merchants: top.map(([merchant, amount]) => ({
        merchant,
        amount
      })),
      daily_allowance: Math.round(remaining / dr)
    };
  });
  const payday = user.payday || 1;
  let daysToPayday;
  if (now.getDate() <= payday) {
    daysToPayday = payday - now.getDate();
  } else {
    const nextMonth = now.getMonth() < 11 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : new Date(now.getFullYear() + 1, 0, 1);
    const paydayNext = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), payday);
    daysToPayday = Math.round((paydayNext.getTime() - now.getTime()) / 86400000);
  }
  const totalSpent = expenseTxs.reduce((s, t) => s + expenseAmount(t, reimb), 0);
  const totalBudget = income;
  const merchantCounts = {};
  const merchantTotals = {};
  for (const t of expenseTxs) {
    if (t.merchant) {
      merchantCounts[t.merchant] = (merchantCounts[t.merchant] || 0) + 1;
      merchantTotals[t.merchant] = (merchantTotals[t.merchant] || 0) + expenseAmount(t, reimb);
    }
  }
  const frequentMerchants = Object.entries(merchantCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([merchant, count]) => ({
    merchant,
    count,
    total: merchantTotals[merchant]
  }));
  const totalRemaining = Math.max(income - totalSpent, 0);
  const dailyAllowance = Math.round(totalRemaining / dr);
  res.json({
    month,
    income,
    total_spent: totalSpent,
    total_budget: totalBudget,
    days_passed: daysPassed,
    days_remaining: daysRemaining,
    days_to_payday: daysToPayday,
    franjas,
    transaction_count: txs.length,
    daily_allowance: dailyAllowance,
    frequent_merchants: frequentMerchants
  });
}));
insightsRouter.get("/summary", ah(async (req, res) => {
  const user = req.user;
  if (!user.monthlyIncome) {
    res.json([]);
    return;
  }
  const now = new Date();
  const months = [];
  for (let i = 0; i < 3; i++) {
    let m = now.getMonth() + 1 - i;
    let y = now.getFullYear();
    if (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  const income = user.monthlyIncome;
  const result = [];
  for (const month of months) {
    const raw = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        month,
        txType: "expense",
        status: {
          in: ["confirmed", "classified"]
        }
      }
    });
    const txs = raw.filter(t => !t.isInternalTransfer && !t.isDuplicate);
    if (!txs.length) continue;
    result.push({
      month,
      total: txs.reduce((s, t) => s + (t.amount ?? 0), 0),
      income,
      by_category: {
        necesidades: txs.filter(t => t.category === "necesidades").reduce((s, t) => s + (t.amount ?? 0), 0),
        gustos: txs.filter(t => t.category === "gustos").reduce((s, t) => s + (t.amount ?? 0), 0),
        ahorro: txs.filter(t => t.category === "ahorro").reduce((s, t) => s + (t.amount ?? 0), 0)
      }
    });
  }
  res.json(result);
}));
insightsRouter.get("/dashboard", ah(async (req, res) => {
  const user = req.user;
  const now = new Date();
  const month = currentMonthStr();
  const income = user.monthlyIncome ?? 0;
  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      month,
      status: {
        in: ["confirmed", "classified"]
      }
    }
  });
  const expenseTxs = txs.filter(t => (t.txType || "expense") === "expense" && !t.isInternalTransfer && !t.isDuplicate);
  const totalSpent = expenseTxs.reduce((s, t) => s + (t.amount ?? 0), 0);
  const days = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const daysPassed = now.getDate();
  const daysRemaining = days - daysPassed;
  const openInvestments = await prisma.investment.findMany({
    where: {
      userId: user.id,
      status: "open"
    }
  });
  const tickers = [...new Set(openInvestments.map(i => i.ticker))];
  const prices = tickers.length ? await prisma.investmentPrice.findMany({
    where: {
      ticker: {
        in: tickers
      }
    }
  }) : [];
  const priceByTicker = new Map(prices.map(p => [p.ticker, p.price]));
  const holdings = openInvestments.map(inv => ({
    quantity: inv.quantity,
    avg_cost: inv.avgCost,
    current_price: priceByTicker.get(inv.ticker) ?? 0
  }));
  const closedInvestments = await prisma.investment.findMany({
    where: {
      userId: user.id,
      status: "closed"
    }
  });
  const closedIds = closedInvestments.map(i => i.id);
  const buyCostByInv = new Map();
  const sellValueByInv = new Map();
  if (closedIds.length) {
    const closedTxs = await prisma.investmentTransaction.findMany({
      where: {
        investmentId: {
          in: closedIds
        }
      }
    });
    for (const tx of closedTxs) {
      if (tx.txType === "buy") {
        buyCostByInv.set(tx.investmentId, (buyCostByInv.get(tx.investmentId) || 0) + tx.quantity * tx.price);
      } else if (tx.txType === "sell") {
        sellValueByInv.set(tx.investmentId, (sellValueByInv.get(tx.investmentId) || 0) + tx.quantity * tx.price);
      }
    }
  }
  const realizedPnl = closedInvestments.reduce((s, inv) => s + (sellValueByInv.get(inv.id) || 0) - (buyCostByInv.get(inv.id) || 0), 0);
  const investmentSummary = calculatePortfolioSummary(holdings, realizedPnl);
  res.json({
    month,
    income,
    total_spent: totalSpent,
    total_budget: income,
    days_remaining: daysRemaining,
    investments: {
      total_invested: investmentSummary.total_invested,
      total_current_value: investmentSummary.total_current_value,
      total_pnl: investmentSummary.total_pnl
    }
  });
}));
