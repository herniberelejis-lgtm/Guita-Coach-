/** Detección de duplicados cross-source y transferencias entre cuentas propias. */

import { prisma } from "@guita-coach/db";
const DATE_WINDOW_DAYS = 1;
const TRANSFER_KEYWORDS = ["transferencia", "transfer", "cuenta propia", "mis cuentas", "entre cuentas", "cvu", "cbu propio"];
function normalize(text) {
  if (!text) return "";
  const nfkd = text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return nfkd.replace(/[^a-z0-9 ]/g, "").trim();
}
function daysBetween(d1, d2) {
  const a = new Date(d1 + "T00:00:00Z").getTime();
  const b = new Date(d2 + "T00:00:00Z").getTime();
  return Math.abs((a - b) / 86400000);
}
function datesClose(d1, d2, window = DATE_WINDOW_DAYS) {
  if (!d1 || !d2) return d1 === d2;
  try {
    return daysBetween(d1, d2) <= window;
  } catch {
    return d1 === d2;
  }
}
function merchantsMatch(m1, m2) {
  const n1 = normalize(m1);
  const n2 = normalize(m2);
  if (!n1 || !n2) return true;
  return n1.includes(n2) || n2.includes(n1);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export async function findCrossSourceDuplicate(userId, item) {
  const {
    amount,
    date: txDate,
    source = "",
    tx_type: txType = "expense"
  } = item;
  if (amount === undefined || amount === null || !txDate) return null;
  let lo = txDate;
  let hi = txDate;
  try {
    lo = addDays(txDate, -DATE_WINDOW_DAYS);
    hi = addDays(txDate, DATE_WINDOW_DAYS);
  } catch {
    // keep lo=hi=txDate
  }
  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      amount,
      txType,
      source: {
        not: source
      },
      date: {
        gte: lo,
        lte: hi
      },
      isDuplicate: false
    }
  });
  for (const c of candidates) {
    if (merchantsMatch(item.merchant, c.merchant)) return c;
  }
  return null;
}
function looksLikeTransfer(tx) {
  const text = normalize(`${tx.merchant || ""} ${tx.provider || ""}`);
  return TRANSFER_KEYWORDS.some(k => text.includes(normalize(k)));
}
export async function markDuplicatesAndTransfers(userId, month) {
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      isDuplicate: false,
      isInternalTransfer: false,
      ...(month ? {
        month
      } : {})
    }
  });
  const expenses = txs.filter(t => t.txType === "expense");
  const incomes = txs.filter(t => t.txType === "income");
  let transfers = 0;
  const usedIncomeIds = new Set();
  const toUpdate = [];
  for (const e of expenses) {
    for (const i of incomes) {
      if (usedIncomeIds.has(i.id)) continue;
      if (e.amount !== i.amount || !datesClose(e.date, i.date)) continue;
      if (looksLikeTransfer(e) || looksLikeTransfer(i) || e.source !== i.source && merchantsMatch(e.merchant, i.merchant)) {
        toUpdate.push(e.id, i.id);
        usedIncomeIds.add(i.id);
        transfers += 1;
        break;
      }
    }
  }
  if (toUpdate.length) {
    await prisma.transaction.updateMany({
      where: {
        id: {
          in: toUpdate
        }
      },
      data: {
        isInternalTransfer: true
      }
    });
  }
  return {
    internal_transfers: transfers
  };
}
