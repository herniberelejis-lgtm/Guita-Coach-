/** Budget endpoints — franjas, onboarding, history. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah, HttpError, expenseAmount, reimbursementMap, daysInMonth } from "@guita-coach/shared";
import { applyRecurring } from "../services/recurring.js";
export const budgetRouter = Router();
budgetRouter.use(requireAuth);
const CATS = ["necesidades", "gustos", "ahorro"];
const LABELS = {
  necesidades: "Necesidades",
  gustos: "Gustos",
  ahorro: "Ahorro"
};
function franjaData(user, txs, month, daysRemaining = 1, reimb = {}, incomeBase) {
  const income = incomeBase ?? user.monthlyIncome ?? 0;
  const limits = {
    necesidades: income * user.necesidadesPct / 100,
    gustos: income * user.gustosPct / 100,
    ahorro: income * user.ahorroPct / 100
  };
  const visible = txs.filter(t => !t.isInternalTransfer && !t.isDuplicate);
  const spent = {};
  for (const cat of CATS) {
    spent[cat] = visible.filter(t => t.category === cat && (t.txType || "expense") === "expense").reduce((s, t) => s + expenseAmount(t, reimb), 0);
  }
  const dr = Math.max(daysRemaining, 1);
  const pctByCat = {
    necesidades: user.necesidadesPct,
    gustos: user.gustosPct,
    ahorro: user.ahorroPct
  };
  return {
    month,
    income,
    franjas: CATS.map(cat => ({
      name: cat,
      label: LABELS[cat],
      pct_config: pctByCat[cat],
      limit: limits[cat],
      spent: spent[cat],
      remaining: Math.max(0, limits[cat] - spent[cat]),
      usage_pct: limits[cat] > 0 ? Math.round(spent[cat] / limits[cat] * 1000) / 10 : 0,
      daily_allowance: Math.round(Math.max(0, limits[cat] - spent[cat]) / dr)
    }))
  };
}
budgetRouter.get("/current", ah(async (req, res) => {
  const user = req.user;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let month = String(req.query.month || "");
  let target;
  if (month) {
    const m = month.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new HttpError(400, "Mes inválido, usá el formato YYYY-MM");
    target = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    month = `${m[1]}-${m[2]}`;
  } else {
    month = currentMonth;
    target = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const isCurrent = month === currentMonth;
  if (isCurrent) await applyRecurring(user.id);
  const txs = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      month,
      status: {
        in: ["confirmed", "classified"]
      }
    }
  });
  const days = daysInMonth(target.getFullYear(), target.getMonth() + 1);
  const daysPassed = isCurrent ? now.getDate() : days;
  const daysRemaining = isCurrent ? Math.max(days - daysPassed, 1) : 0;
  const reimb = await reimbursementMap(user.id);
  const visible = txs.filter(t => !t.isInternalTransfer && !t.isDuplicate);
  const trackedIncome = visible.filter(t => (t.txType || "expense") === "income" && !t.isReimbursement).reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalExpenses = visible.filter(t => (t.txType || "expense") === "expense").reduce((s, t) => s + expenseAmount(t, reimb), 0);
  const isVariable = Boolean(user.incomeIsVariable);
  const declaredIncome = user.monthlyIncome ?? 0;
  let totalIncome;
  let incomeBase;
  if (isVariable) {
    totalIncome = trackedIncome;
    incomeBase = trackedIncome;
  } else {
    totalIncome = Math.max(trackedIncome, declaredIncome);
    incomeBase = totalIncome;
  }
  const data = franjaData(user, txs, month, daysRemaining, reimb, incomeBase);
  data.days_passed = daysPassed;
  data.days_in_month = days;
  data.days_remaining = days - daysPassed;
  const pendingCount = txs.filter(t => t.needsReview && t.status !== "reviewed").length;
  data.month = month;
  data.is_current_month = isCurrent;
  data.total_income = totalIncome;
  data.tracked_income = trackedIncome;
  data.declared_income = declaredIncome;
  data.income_is_variable = isVariable;
  data.income_is_declared = !isVariable && declaredIncome > trackedIncome;
  data.total_expenses = totalExpenses;
  data.balance = user.balance ?? 0;
  data.pending_count = pendingCount;
  data.onboarding_done = user.onboardingDone;
  data.name = user.name;
  data.payday = user.payday;
  const alerts = await prisma.alert.findMany({
    where: {
      userId: user.id,
      isRead: false
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  data.alerts = alerts.map(a => ({
    id: a.id,
    type: a.type,
    category: a.category,
    message: a.message,
    ai_advice: a.aiAdvice,
    severity: a.severity,
    payload: a.payload,
    created_at: a.createdAt.toISOString()
  }));
  res.json(data);
}));
const OnboardingSchema = z.object({
  name: z.string(),
  monthly_income: z.number(),
  necesidades_pct: z.number().default(50),
  gustos_pct: z.number().default(30),
  ahorro_pct: z.number().default(20),
  payday: z.number().default(1),
  income_is_variable: z.boolean().default(false)
});
budgetRouter.post("/onboarding", ah(async (req, res) => {
  const payload = OnboardingSchema.parse(req.body);
  if (payload.necesidades_pct + payload.gustos_pct + payload.ahorro_pct !== 100) {
    throw new HttpError(400, "Los porcentajes deben sumar 100");
  }
  await prisma.user.update({
    where: {
      id: req.user.id
    },
    data: {
      name: payload.name,
      monthlyIncome: payload.monthly_income,
      necesidadesPct: payload.necesidades_pct,
      gustosPct: payload.gustos_pct,
      ahorroPct: payload.ahorro_pct,
      payday: payload.payday,
      incomeIsVariable: payload.income_is_variable,
      onboardingDone: true
    }
  });
  res.json({
    ok: true
  });
}));
const BudgetUpdateSchema = z.object({
  monthly_income: z.number().optional(),
  necesidades_pct: z.number().optional(),
  gustos_pct: z.number().optional(),
  ahorro_pct: z.number().optional(),
  payday: z.number().optional(),
  income_is_variable: z.boolean().optional()
});
budgetRouter.patch("/settings", ah(async (req, res) => {
  const payload = BudgetUpdateSchema.parse(req.body);
  const user = req.user;
  const data = {};
  if (payload.monthly_income !== undefined) data.monthlyIncome = payload.monthly_income;
  if (payload.necesidades_pct !== undefined) data.necesidadesPct = payload.necesidades_pct;
  if (payload.gustos_pct !== undefined) data.gustosPct = payload.gustos_pct;
  if (payload.ahorro_pct !== undefined) data.ahorroPct = payload.ahorro_pct;
  if (payload.payday !== undefined) data.payday = payload.payday;
  if (payload.income_is_variable !== undefined) data.incomeIsVariable = payload.income_is_variable;
  const necesidades = data.necesidadesPct ?? user.necesidadesPct;
  const gustos = data.gustosPct ?? user.gustosPct;
  const ahorro = data.ahorroPct ?? user.ahorroPct;
  const total = necesidades + gustos + ahorro;
  if (total !== 100) throw new HttpError(400, `Los porcentajes suman ${total}, deben ser 100`);
  await prisma.user.update({
    where: {
      id: user.id
    },
    data
  });
  res.json({
    ok: true
  });
}));
const BalanceSchema = z.object({
  balance: z.number()
});
budgetRouter.patch("/balance", ah(async (req, res) => {
  const payload = BalanceSchema.parse(req.body);
  const user = await prisma.user.update({
    where: {
      id: req.user.id
    },
    data: {
      balance: payload.balance
    }
  });
  res.json({
    ok: true,
    balance: user.balance
  });
}));
budgetRouter.get("/months", ah(async (req, res) => {
  const rows = await prisma.transaction.findMany({
    where: {
      userId: req.user.id,
      status: {
        in: ["confirmed", "classified"]
      }
    },
    select: {
      month: true
    },
    distinct: ["month"]
  });
  const months = new Set(rows.map(r => r.month).filter(Boolean));
  const now = new Date();
  months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  res.json([...months].sort().reverse());
}));
budgetRouter.post("/alerts/:alertId/read", ah(async (req, res) => {
  const alert = await prisma.alert.findFirst({
    where: {
      id: Number(req.params.alertId),
      userId: req.user.id
    }
  });
  if (!alert) throw new HttpError(404, "Alerta no encontrada");
  await prisma.alert.update({
    where: {
      id: alert.id
    },
    data: {
      isRead: true
    }
  });
  res.json({
    ok: true
  });
}));
budgetRouter.get("/history", ah(async (req, res) => {
  const user = req.user;
  const rows = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      status: {
        in: ["confirmed", "classified"]
      }
    },
    select: {
      month: true
    },
    distinct: ["month"]
  });
  const months = [...new Set(rows.map(r => r.month).filter(Boolean))].sort().reverse().slice(0, 6);
  const reimb = await reimbursementMap(user.id);
  const result = [];
  for (const month of months) {
    const txs = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        month,
        status: {
          in: ["confirmed", "classified"]
        }
      }
    });
    result.push(franjaData(user, txs, month, 1, reimb));
  }
  res.json(result);
}));
