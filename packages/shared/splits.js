/** Detección de gastos compartidos (vaquitas) y neteo de devoluciones.
 *
 * Patrón: el usuario paga un monto grande y en los días siguientes recibe
 * varias transferencias menores. La app nunca netea sola: crea una alerta
 * que pregunta, y solo al confirmar las entradas se marcan como devoluciones
 * (isReimbursement) vinculadas al gasto (reimbursesTxId).
 */

import { prisma } from "@guita-coach/db";
const MIN_EXPENSE = 15_000;
const WINDOW_DAYS = 7;
const MIN_INCOMES = 2;
const MIN_RATIO = 0.2;
function clean(txs) {
  return txs.filter(t => !t.isInternalTransfer && !t.isDuplicate);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export async function detectSplitCandidates(userId, lookbackDays = 60) {
  const since = addDays(new Date().toISOString().slice(0, 10), -lookbackDays);
  const txs = clean(await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: since
      }
    }
  }));
  const expenses = txs.filter(t => t.txType === "expense" && (t.amount ?? 0) >= MIN_EXPENSE);
  const incomes = txs.filter(t => t.txType === "income" && !t.isReimbursement);
  const asked = new Set();
  const existingAlerts = await prisma.alert.findMany({
    where: {
      userId,
      type: "split_suggestion"
    }
  });
  for (const a of existingAlerts) {
    try {
      const payload = JSON.parse(a.payload || "{}");
      if (payload.expense_id) asked.add(payload.expense_id);
    } catch {
      continue;
    }
  }
  let created = 0;
  for (const exp of expenses) {
    if (asked.has(exp.id) || !exp.date) continue;
    const d1 = addDays(exp.date, WINDOW_DAYS);
    const candidates = incomes.filter(i => i.date && exp.date <= i.date && i.date <= d1 && (i.amount ?? 0) < (exp.amount ?? 0));
    if (candidates.length < MIN_INCOMES) continue;
    const picked = [];
    let total = 0;
    for (const i of [...candidates].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))) {
      if (total + (i.amount ?? 0) <= (exp.amount ?? 0) * 1.02) {
        picked.push(i);
        total += i.amount ?? 0;
      }
    }
    if (picked.length < MIN_INCOMES || total < (exp.amount ?? 0) * MIN_RATIO) continue;
    await prisma.alert.create({
      data: {
        userId,
        type: "split_suggestion",
        category: exp.category || "",
        severity: "warning",
        message: `Pagaste $${(exp.amount ?? 0).toLocaleString("es-AR")} en ${exp.merchant || "un comercio"} el ${exp.date} y en los ${WINDOW_DAYS} días siguientes te entraron ${picked.length} transferencias por $${total.toLocaleString("es-AR")}. ¿Fue un gasto compartido que te devolvieron?`,
        aiAdvice: "Si confirmás, esas entradas se descuentan del gasto y no cuentan como ingreso.",
        payload: JSON.stringify({
          expense_id: exp.id,
          income_ids: picked.map(i => i.id),
          reimbursed_total: total
        })
      }
    });
    created += 1;
  }
  return created;
}
export async function confirmSplit(userId, expenseId, incomeIds) {
  const exp = await prisma.transaction.findFirst({
    where: {
      id: expenseId,
      userId,
      txType: "expense"
    }
  });
  if (!exp) throw new Error("Gasto no encontrado");
  let linked = 0;
  let total = 0;
  for (const iid of incomeIds) {
    const inc = await prisma.transaction.findFirst({
      where: {
        id: iid,
        userId,
        txType: "income"
      }
    });
    if (inc && !inc.isReimbursement) {
      await prisma.transaction.update({
        where: {
          id: inc.id
        },
        data: {
          isReimbursement: true,
          reimbursesTxId: exp.id
        }
      });
      linked += 1;
      total += inc.amount ?? 0;
    }
  }
  return {
    linked,
    reimbursed_total: total,
    net_expense: Math.max((exp.amount ?? 0) - total, 0)
  };
}
export async function reimbursementMap(userId) {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      isReimbursement: true,
      reimbursesTxId: {
        not: null
      }
    }
  });
  const out = {};
  for (const r of rows) {
    const id = r.reimbursesTxId;
    out[id] = (out[id] || 0) + (r.amount ?? 0);
  }
  return out;
}
export function expenseAmount(t, reimb) {
  return Math.max((t.amount ?? 0) - (reimb[t.id] || 0), 0);
}
