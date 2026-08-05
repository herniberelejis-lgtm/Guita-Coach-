/** Chat router: AI financial advisor with Argentine investment priority framework. */
import { Router } from "express";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah, reimbursementMap, calculateConcentrationFlags, aiProvider } from "@guita-coach/shared";
export const chatRouter = Router();
chatRouter.use(requireAuth);
const STARTERS = ["Cuanto me sobra a fin de mes para ahorrar o invertir?", "Tengo deudas, por donde empiezo?", "Ya tengo fondo de emergencia, en que invierto?", "Cuanto necesito para armar mi fondo de emergencia?", "Como diversifico mis ahorros en Argentina?"];
function monthList(n = 6) {
  const today = new Date();
  const months = [];
  let y = today.getFullYear();
  let m = today.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}
function cleanExternalText(value, maxLen = 80) {
  if (!value) return value;
  let cleaned = [...value].map(ch => isPrintable(ch) && !"\r\n\t".includes(ch) ? ch : " ").join("");
  cleaned = cleaned.replace(/<datos_usuario>/g, "").replace(/<\/datos_usuario>/g, "");
  cleaned = cleaned.split(/\s+/).filter(Boolean).join(" ");
  return cleaned.slice(0, maxLen);
}
function isPrintable(ch) {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x20 && code !== 0x7f;
}
async function loadInvestmentContext(user) {
  const invs = await prisma.investment.findMany({
    where: {
      userId: user.id,
      status: "open",
      quantity: {
        gt: 0
      }
    }
  });
  if (!invs.length) return null;
  const priceRecords = await prisma.investmentPrice.findMany();
  const priceMap = new Map(priceRecords.map(r => [r.ticker, r]));
  let totalInvested = 0;
  let totalCurrent = 0;
  const holdings = invs.map(inv => {
    const priceRec = priceMap.get(inv.ticker);
    const price = priceRec ? priceRec.price : inv.avgCost;
    const cost = inv.quantity * inv.avgCost;
    const value = inv.quantity * price;
    totalInvested += cost;
    totalCurrent += value;
    return {
      ticker: inv.ticker,
      asset_type: inv.assetType || "stock",
      current_value: value,
      pnl_pct: cost ? (value - cost) / cost * 100 : 0
    };
  });
  return {
    total_invested: totalInvested,
    total_current_value: totalCurrent,
    holdings,
    concentration_flags: calculateConcentrationFlags(holdings)
  };
}
async function loadFinancialContext(user) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = monthList(6);
  let allTxs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      month: {
        in: months
      },
      isInternalTransfer: false,
      isDuplicate: false
    }
  });
  await reimbursementMap(user.id);
  allTxs = allTxs.filter(t => !(t.txType === "income" && t.isReimbursement));
  const txs = allTxs.filter(t => t.month === month);
  const income = txs.filter(t => t.txType === "income").reduce((s, t) => s + (t.amount ?? 0), 0);
  const expenses = txs.filter(t => t.txType === "expense").reduce((s, t) => s + (t.amount ?? 0), 0);
  const savingsAccumulated = txs.filter(t => t.category === "ahorro").reduce((s, t) => s + (t.amount ?? 0), 0);
  const history = [];
  for (const m of [...months].reverse()) {
    const mInc = allTxs.filter(t => t.month === m && t.txType === "income").reduce((s, t) => s + (t.amount ?? 0), 0);
    const mExp = allTxs.filter(t => t.month === m && t.txType === "expense").reduce((s, t) => s + (t.amount ?? 0), 0);
    if (mInc || mExp) history.push([m, mInc, mExp]);
  }
  function top(items, n) {
    const totals = {};
    for (const t of items) {
      if (t.txType === "expense" && t.merchant) {
        const merchant = cleanExternalText(t.merchant);
        totals[merchant] = (totals[merchant] || 0) + (t.amount ?? 0);
      }
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  const bySubcat = {};
  for (const t of txs) {
    if (t.txType === "expense") {
      const key = t.subcategory || t.category || "sin categoría";
      bySubcat[key] = (bySubcat[key] || 0) + (t.amount ?? 0);
    }
  }
  const goals = await prisma.goal.findMany({
    where: {
      userId: user.id,
      parentId: null
    }
  });
  const recurring = await prisma.recurringExpense.findMany({
    where: {
      userId: user.id,
      active: true
    }
  });
  const committed = recurring.reduce((s, r) => s + r.amount, 0);
  const monthlyIncomeConfig = user.monthlyIncome ?? 0;
  return {
    month,
    income_this_month: income,
    expenses_this_month: expenses,
    balance_this_month: income - expenses,
    savings_accumulated_this_month: savingsAccumulated,
    monthly_income_configured: monthlyIncomeConfig,
    limits: {
      necesidades: monthlyIncomeConfig * user.necesidadesPct / 100,
      gustos: monthlyIncomeConfig * user.gustosPct / 100,
      ahorro: monthlyIncomeConfig * user.ahorroPct / 100
    },
    emergency_fund_target: expenses * 6,
    history,
    top_merchants_month: top(txs, 6),
    top_merchants_6m: top(allTxs, 8),
    by_subcategory: Object.entries(bySubcat).sort((a, b) => b[1] - a[1]).slice(0, 8),
    goals: goals.map(g => [g.name, g.savedAmount, g.targetAmount, g.isDone]),
    recurring_committed: committed,
    pending_review: txs.filter(t => t.needsReview).length,
    investments: await loadInvestmentContext(user)
  };
}
function fmt(n) {
  return Math.round(n).toLocaleString("es-AR");
}
function formatContext(ctx) {
  const lines = [`Mes actual: ${ctx.month}`, `Ingresos del mes: $${fmt(ctx.income_this_month)}`, `Gastos del mes: $${fmt(ctx.expenses_this_month)}`, `Balance del mes: $${fmt(ctx.balance_this_month)}`, `Ingreso mensual configurado: $${fmt(ctx.monthly_income_configured)}`, `Limites de presupuesto: necesidades $${fmt(ctx.limits.necesidades)} | gustos $${fmt(ctx.limits.gustos)} | ahorro $${fmt(ctx.limits.ahorro)}`, `Gastos fijos mensuales comprometidos: $${fmt(ctx.recurring_committed)}`, `Transacciones pendientes de revisar: ${ctx.pending_review}`, `Meta fondo de emergencia (6 meses de gastos): $${fmt(ctx.emergency_fund_target)}`];
  if (ctx.history.length) {
    lines.push("Historial (ultimos meses):");
    lines.push(...ctx.history.map(([m, i, e]) => `  ${m}: ingresos $${fmt(i)}, gastos $${fmt(e)}`));
  }
  if (ctx.by_subcategory.length) {
    lines.push("Gasto del mes por categoria:");
    lines.push(...ctx.by_subcategory.map(([c, a]) => `  ${c}: $${fmt(a)}`));
  }
  if (ctx.top_merchants_month.length) {
    lines.push("Top comercios del mes:");
    lines.push(...ctx.top_merchants_month.map(([m, a]) => `  ${m}: $${fmt(a)}`));
  }
  if (ctx.top_merchants_6m.length) {
    lines.push("Top comercios de los ultimos 6 meses:");
    lines.push(...ctx.top_merchants_6m.map(([m, a]) => `  ${m}: $${fmt(a)}`));
  }
  if (ctx.goals.length) {
    lines.push("Metas de ahorro:");
    lines.push(...ctx.goals.map(([n, s, t, d]) => `  ${n}: $${fmt(s)} de $${fmt(t)}${d ? " (cumplida)" : ""}`));
  }
  if (ctx.investments) {
    const inv = ctx.investments;
    lines.push("Cartera de inversiones:");
    lines.push(`  Invertido: $${fmt(inv.total_invested)} | Valor actual: $${fmt(inv.total_current_value)}`);
    lines.push(...inv.holdings.slice(0, 8).map(h => `  ${h.ticker} (${h.asset_type}): valor $${fmt(h.current_value)}, P&L ${h.pnl_pct >= 0 ? "+" : ""}${h.pnl_pct.toFixed(1)}%`));
    if (inv.concentration_flags.length) {
      const flagsStr = inv.concentration_flags.map(f => `${f.ticker} ${Math.round(f.pct)}%`).join(", ");
      lines.push(`  Concentracion de riesgo: ${flagsStr} (recomendado: maximo 30% en un solo instrumento)`);
    }
  }
  return lines.join("\n");
}
function ruleBasedReply(message, ctx) {
  const msgLower = message.toLowerCase();
  const balance = ctx.balance_this_month;
  const income = ctx.income_this_month;
  const ahorroLimit = ctx.limits.ahorro;
  const emergencyTarget = ctx.emergency_fund_target;
  if (["deuda", "prestamo", "tarjeta", "credito"].some(w => msgLower.includes(w))) {
    return "Primero que nada, las deudas de alta tasa (tarjetas, prestamos) siempre van antes " + "que cualquier inversion. Mientras tenes deuda al 5%+ mensual, cualquier rendimiento " + "de inversion queda por debajo. Pagalas primero, dale.";
  }
  if (["emergencia", "colchon", "reserva"].some(w => msgLower.includes(w))) {
    return `Tu meta de fondo de emergencia es $${fmt(emergencyTarget)} (6 meses de gastos). ` + `Una vez canceladas las deudas, dedica el ahorro mensual ($${fmt(ahorroLimit)}) ` + "a un FCI money market o caja de ahorro hasta llegar a esa cifra.";
  }
  if (["invert", "cedear", "bono", "fci", "plazo fijo"].some(w => msgLower.includes(w))) {
    return "Para invertir en Argentina: cedears para exposicion al dolar y acciones globales, " + "bonos CER para cubrirte de la inflacion, FCI diversificados para liquidez. " + "Nunca pongas mas del 30% en un solo instrumento.";
  }
  if (balance > 0) {
    return `Este mes te sobran $${fmt(balance)} despues de gastos. ` + "Primero asegurate de no tener deudas de alta tasa, despues construi tu fondo de emergencia " + `(meta: $${fmt(emergencyTarget)}), y solo entonces empeza a invertir.`;
  }
  return `Tus gastos este mes ($${fmt(ctx.expenses_this_month)}) superaron tus ingresos ` + `($${fmt(income)}). Antes de pensar en inversiones, revisemos donde recortar.`;
}
chatRouter.post("/", ah(async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const history = req.body?.history || [];
  if (!message) {
    res.json({
      reply: "Mandame tu consulta y te ayudo."
    });
    return;
  }
  const ctx = await loadFinancialContext(req.user);
  let reply = await aiProvider.chat(message, history, formatContext(ctx));
  if (!reply) reply = ruleBasedReply(message, ctx);
  res.json({
    reply
  });
}));
chatRouter.get("/starters", ah(async (_req, res) => {
  res.json({
    starters: STARTERS
  });
}));
