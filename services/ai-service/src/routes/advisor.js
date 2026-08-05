/** Advisor router: pattern analysis and spending advice. */
import { Router } from "express";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah, aiProvider } from "@guita-coach/shared";
export const advisorRouter = Router();
advisorRouter.use(requireAuth);
async function getPatterns(userId, month) {
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      month,
      txType: "expense",
      isInternalTransfer: false,
      isDuplicate: false
    }
  });
  const byFreq = {};
  const byAmount = {};
  for (const t of txs) {
    if (t.merchant) {
      byFreq[t.merchant] = (byFreq[t.merchant] || 0) + 1;
      byAmount[t.merchant] = (byAmount[t.merchant] || 0) + (t.amount ?? 0);
    }
  }
  const topFreq = Object.entries(byFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([merchant, count]) => ({
    merchant,
    count,
    total: byAmount[merchant] || 0
  }));
  const topAmount = Object.entries(byAmount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([merchant, total]) => ({
    merchant,
    total,
    count: byFreq[merchant] || 0
  }));
  const byCat = {};
  for (const t of txs) {
    const cat = t.category || "";
    byCat[cat] = (byCat[cat] || 0) + (t.amount ?? 0);
  }
  return {
    top_by_frequency: topFreq,
    top_by_amount: topAmount,
    by_category: byCat
  };
}
function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
advisorRouter.get("/patterns", ah(async (req, res) => {
  const month = req.query.month ? String(req.query.month) : currentMonthStr();
  res.json(await getPatterns(req.user.id, month));
}));
function ruleBasedAdvice(patterns, focus, income) {
  const top = patterns.top_by_frequency;
  if (!top.length) return `No tenes gastos registrados en ${focus} este mes.`;
  const {
    merchant,
    count,
    total
  } = top[0];
  const spentCat = patterns.by_category[focus] || 0;
  const factor = {
    necesidades: 0.5,
    gustos: 0.3,
    ahorro: 0.2
  }[focus] ?? 0.3;
  const limit = income * factor;
  const pct = limit > 0 ? Math.round(spentCat / limit * 100) : 0;
  return `Tu gasto mas frecuente en ${focus} es ${merchant} (${count} veces, ` + `$${total.toLocaleString("es-AR")} en total). Estas al ${pct}% del limite de ${focus}.`;
}
advisorRouter.post("/advice", ah(async (req, res) => {
  const user = req.user;
  const month = req.body?.month || currentMonthStr();
  const focus = req.body?.focus || "gustos";
  const patterns = await getPatterns(user.id, month);
  const income = user.monthlyIncome ?? 0;
  let advice = await aiProvider.getAdvice(patterns, focus, income);
  if (!advice) advice = ruleBasedAdvice(patterns, focus, income);
  res.json({
    advice,
    month,
    focus
  });
}));
