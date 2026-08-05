/** Transactions CRUD + category correction. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah, HttpError, normalizeMethod, confirmSplit } from "@guita-coach/shared";
import { classify } from "../services/classifier.js";
import { markDuplicatesAndTransfers } from "../services/dedup.js";
import { runAlertEngine } from "../services/alertEngine.js";
export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);
function txDict(t) {
  return {
    id: t.id,
    merchant: t.merchant,
    amount: t.amount,
    date: t.date,
    month: t.month,
    tx_type: t.txType,
    category: t.category,
    subcategory: t.subcategory,
    source: t.source,
    provider: t.provider,
    payment_method: t.paymentMethod || "",
    confidence: t.confidence,
    needs_review: t.needsReview,
    is_internal_transfer: Boolean(t.isInternalTransfer),
    is_duplicate: Boolean(t.isDuplicate),
    ai_reason: t.aiReason,
    status: t.status
  };
}
transactionsRouter.get("/", ah(async (req, res) => {
  const user = req.user;
  const month = req.query.month ? String(req.query.month) : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const paymentMethod = req.query.payment_method ? String(req.query.payment_method) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const offset = req.query.offset ? Number(req.query.offset) : 0;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const where = {
    userId: user.id,
    month: month || currentMonth,
    status: {
      in: ["confirmed", "classified"]
    }
  };
  if (category) where.category = category;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (search) where.merchant = {
    contains: search
  };
  const total = await prisma.transaction.count({
    where
  });
  const txs = await prisma.transaction.findMany({
    where,
    orderBy: {
      date: "desc"
    },
    skip: offset,
    take: limit
  });
  res.json({
    total,
    items: txs.map(txDict)
  });
}));
transactionsRouter.get("/needs-review", ah(async (req, res) => {
  const txs = await prisma.transaction.findMany({
    where: {
      userId: req.user.id,
      needsReview: true
    },
    orderBy: {
      date: "desc"
    }
  });
  res.json(txs.map(txDict));
}));
transactionsRouter.post("/reclassify", ah(async (req, res) => {
  const user = req.user;
  const pending = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      needsReview: true,
      txType: "expense"
    }
  });
  let classified = 0;
  for (const tx of pending) {
    const result = await classify(tx.merchant || "", tx.amount || 0, tx.source || "manual", user.id);
    if (!result.category) continue;
    const confidence = result.confidence ?? 0.8;
    const needsReview = confidence < 0.85;
    await prisma.transaction.update({
      where: {
        id: tx.id
      },
      data: {
        category: result.category,
        subcategory: result.subcategory || tx.subcategory,
        confidence,
        ruleUsed: result.rule_used,
        aiReason: result.ai_reason,
        needsReview
      }
    });
    if (!needsReview) classified += 1;
  }
  res.json({
    ok: true,
    pending: pending.length,
    classified
  });
}));
const ManualTxSchema = z.object({
  merchant: z.string().min(1).max(200),
  amount: z.number().positive(),
  date: z.string(),
  tx_type: z.string().default("expense"),
  category: z.string().default(""),
  subcategory: z.string().default(""),
  payment_method: z.string().default("")
});
transactionsRouter.post("/", ah(async (req, res) => {
  const user = req.user;
  const payload = ManualTxSchema.parse(req.body);
  let category;
  let subcategory;
  let confidence;
  let needsReview;
  if (payload.tx_type === "income") {
    category = "ingreso";
    subcategory = payload.subcategory || "";
    confidence = 1.0;
    needsReview = false;
  } else if (payload.category) {
    category = payload.category;
    subcategory = payload.subcategory;
    confidence = 1.0;
    needsReview = false;
  } else {
    const result = await classify(payload.merchant, payload.amount, "manual", user.id);
    category = result.category || "gustos";
    subcategory = result.subcategory || "";
    confidence = result.confidence ?? 0.7;
    needsReview = !result.category;
  }
  const tx = await prisma.transaction.create({
    data: {
      userId: user.id,
      source: "manual",
      txType: payload.tx_type,
      provider: "Manual",
      merchant: payload.merchant,
      amount: payload.amount,
      date: payload.date,
      month: payload.date.slice(0, 7),
      category,
      subcategory,
      status: "confirmed",
      confidence,
      paymentMethod: normalizeMethod(payload.payment_method),
      needsReview
    }
  });
  await markDuplicatesAndTransfers(user.id, tx.month || undefined);
  await runAlertEngine(user.id);
  res.json(txDict(tx));
}));
const CategoryCorrectionSchema = z.object({
  category: z.string(),
  subcategory: z.string().default(""),
  save_rule: z.boolean().default(true)
});
transactionsRouter.patch("/:txId/category", ah(async (req, res) => {
  const user = req.user;
  const payload = CategoryCorrectionSchema.parse(req.body);
  const tx = await prisma.transaction.findFirst({
    where: {
      id: Number(req.params.txId),
      userId: user.id
    }
  });
  if (!tx) throw new HttpError(404, "Transacción no encontrada");
  const updated = await prisma.transaction.update({
    where: {
      id: tx.id
    },
    data: {
      category: payload.category,
      subcategory: payload.subcategory,
      needsReview: false,
      confidence: 1.0,
      ruleUsed: "manual_correction"
    }
  });
  if (payload.save_rule) {
    const pattern = (tx.merchant || "").toLowerCase().trim();
    if (pattern) {
      const existing = await prisma.categoryRule.findFirst({
        where: {
          userId: user.id,
          pattern
        }
      });
      if (existing) {
        await prisma.categoryRule.update({
          where: {
            id: existing.id
          },
          data: {
            category: payload.category,
            subcategory: payload.subcategory
          }
        });
      } else {
        await prisma.categoryRule.create({
          data: {
            userId: user.id,
            pattern,
            category: payload.category,
            subcategory: payload.subcategory,
            priority: 10,
            fromCorrection: true
          }
        });
      }
    }
  }
  res.json(txDict(updated));
}));
const SplitConfirmSchema = z.object({
  income_ids: z.array(z.number()),
  alert_id: z.number().nullable().optional()
});
transactionsRouter.post("/:txId/split-confirm", ah(async (req, res) => {
  const user = req.user;
  const payload = SplitConfirmSchema.parse(req.body);
  let result;
  try {
    result = await confirmSplit(user.id, Number(req.params.txId), payload.income_ids);
  } catch (e) {
    throw new HttpError(404, e instanceof Error ? e.message : String(e));
  }
  if (payload.alert_id) {
    const alert = await prisma.alert.findFirst({
      where: {
        id: payload.alert_id,
        userId: user.id
      }
    });
    if (alert) await prisma.alert.update({
      where: {
        id: alert.id
      },
      data: {
        isRead: true
      }
    });
  }
  res.json(result);
}));
transactionsRouter.delete("/:txId", ah(async (req, res) => {
  const user = req.user;
  const tx = await prisma.transaction.findFirst({
    where: {
      id: Number(req.params.txId),
      userId: user.id
    }
  });
  if (!tx) throw new HttpError(404, "Transacción no encontrada");
  await prisma.transaction.delete({
    where: {
      id: tx.id
    }
  });
  res.json({
    ok: true
  });
}));
