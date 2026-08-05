/** Metas de ahorro (con submetas) y gastos fijos/cuotas. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah, HttpError } from "@guita-coach/shared";
import { monthlyCommitted } from "../services/recurring.js";
export const goalsRouter = Router();
goalsRouter.use(requireAuth);
function goalDict(g, children = []) {
  const pct = g.targetAmount > 0 ? Math.round(g.savedAmount / g.targetAmount * 1000) / 10 : 0;
  return {
    id: g.id,
    parent_id: g.parentId,
    name: g.name,
    target_amount: g.targetAmount,
    saved_amount: g.savedAmount,
    currency: g.currency,
    deadline: g.deadline,
    is_done: g.isDone,
    progress_pct: Math.min(100, pct),
    subgoals: children
  };
}
goalsRouter.get("/", ah(async (req, res) => {
  const goals = await prisma.goal.findMany({
    where: {
      userId: req.user.id
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  const byParent = new Map();
  for (const g of goals) {
    if (g.parentId) {
      if (!byParent.has(g.parentId)) byParent.set(g.parentId, []);
      byParent.get(g.parentId).push(goalDict(g));
    }
  }
  res.json(goals.filter(g => !g.parentId).map(g => goalDict(g, byParent.get(g.id) || [])));
}));
const GoalSchema = z.object({
  name: z.string().min(1).max(120),
  target_amount: z.number().positive(),
  currency: z.string().default("ARS"),
  deadline: z.string().nullable().optional(),
  parent_id: z.number().nullable().optional()
});
goalsRouter.post("/", ah(async (req, res) => {
  const user = req.user;
  const payload = GoalSchema.parse(req.body);
  if (payload.parent_id) {
    const parent = await prisma.goal.findFirst({
      where: {
        id: payload.parent_id,
        userId: user.id
      }
    });
    if (!parent) throw new HttpError(404, "Meta padre no encontrada");
    if (parent.parentId) throw new HttpError(400, "Solo se permite un nivel de submetas");
  }
  const goal = await prisma.goal.create({
    data: {
      userId: user.id,
      name: payload.name.trim(),
      targetAmount: payload.target_amount,
      currency: payload.currency === "USD" ? "USD" : "ARS",
      deadline: payload.deadline,
      parentId: payload.parent_id
    }
  });
  res.json(goalDict(goal));
}));
const ContributeSchema = z.object({
  amount: z.number().positive()
});
goalsRouter.post("/:goalId/contribute", ah(async (req, res) => {
  const user = req.user;
  const payload = ContributeSchema.parse(req.body);
  const goal = await prisma.goal.findFirst({
    where: {
      id: Number(req.params.goalId),
      userId: user.id
    }
  });
  if (!goal) throw new HttpError(404, "Meta no encontrada");
  const savedAmount = goal.savedAmount + payload.amount;
  const updated = await prisma.goal.update({
    where: {
      id: goal.id
    },
    data: {
      savedAmount,
      isDone: savedAmount >= goal.targetAmount
    }
  });
  if (goal.parentId) {
    const parent = await prisma.goal.findFirst({
      where: {
        id: goal.parentId,
        userId: user.id
      }
    });
    if (parent) {
      const parentSaved = parent.savedAmount + payload.amount;
      await prisma.goal.update({
        where: {
          id: parent.id
        },
        data: {
          savedAmount: parentSaved,
          isDone: parentSaved >= parent.targetAmount
        }
      });
    }
  }
  res.json(goalDict(updated));
}));
goalsRouter.delete("/:goalId", ah(async (req, res) => {
  const user = req.user;
  const goal = await prisma.goal.findFirst({
    where: {
      id: Number(req.params.goalId),
      userId: user.id
    }
  });
  if (!goal) throw new HttpError(404, "Meta no encontrada");
  await prisma.goal.deleteMany({
    where: {
      parentId: goal.id,
      userId: user.id
    }
  });
  await prisma.goal.delete({
    where: {
      id: goal.id
    }
  });
  res.json({
    ok: true
  });
}));

// ─── Gastos fijos / cuotas ──────────────────────────────────────────────────

goalsRouter.get("/recurring", ah(async (req, res) => {
  const user = req.user;
  const items = await prisma.recurringExpense.findMany({
    where: {
      userId: user.id
    },
    orderBy: [{
      active: "desc"
    }, {
      dayOfMonth: "asc"
    }]
  });
  res.json({
    monthly_committed: await monthlyCommitted(user.id),
    items: items.map(i => ({
      id: i.id,
      merchant: i.merchant,
      amount: i.amount,
      category: i.category,
      day_of_month: i.dayOfMonth,
      installments_total: i.installmentsTotal,
      installments_paid: i.installmentsPaid,
      active: i.active
    }))
  });
}));
const RecurringSchema = z.object({
  merchant: z.string().min(1).max(120),
  amount: z.number().positive(),
  category: z.string().default("necesidades"),
  day_of_month: z.number().min(1).max(28).default(1),
  installments_total: z.number().min(0).max(120).default(0)
});
goalsRouter.post("/recurring", ah(async (req, res) => {
  const payload = RecurringSchema.parse(req.body);
  const item = await prisma.recurringExpense.create({
    data: {
      userId: req.user.id,
      merchant: payload.merchant.trim(),
      amount: payload.amount,
      category: payload.category,
      dayOfMonth: payload.day_of_month,
      installmentsTotal: payload.installments_total
    }
  });
  res.json({
    ok: true,
    id: item.id
  });
}));
goalsRouter.delete("/recurring/:itemId", ah(async (req, res) => {
  const item = await prisma.recurringExpense.findFirst({
    where: {
      id: Number(req.params.itemId),
      userId: req.user.id
    }
  });
  if (!item) throw new HttpError(404, "Gasto fijo no encontrado");
  await prisma.recurringExpense.delete({
    where: {
      id: item.id
    }
  });
  res.json({
    ok: true
  });
}));
