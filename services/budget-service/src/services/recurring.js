/** Materializa gastos fijos y cuotas como transacciones del mes.
 *
 * Idempotente: cada RecurringExpense recuerda el último mes aplicado
 * (lastAppliedMonth). El "gana quien llega primero" se resuelve con un
 * UPDATE condicional atómico (updateMany con where + count), no con una
 * lectura seguida de una escritura (evita duplicar en requests concurrentes).
 */
import { prisma } from "@guita-coach/db";
export async function applyRecurring(userId, today = new Date()) {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  let created = 0;
  const items = await prisma.recurringExpense.findMany({
    where: {
      userId,
      active: true
    }
  });
  for (const item of items) {
    if (item.lastAppliedMonth === month) continue;
    if (today.getDate() < Math.min(item.dayOfMonth, 28)) continue;
    if (item.installmentsTotal > 0 && item.installmentsPaid >= item.installmentsTotal) {
      await prisma.recurringExpense.update({
        where: {
          id: item.id
        },
        data: {
          active: false
        }
      });
      continue;
    }
    const installmentsPaidBefore = item.installmentsPaid;
    const result = await prisma.recurringExpense.updateMany({
      where: {
        id: item.id,
        active: true,
        OR: [{
          lastAppliedMonth: {
            not: month
          }
        }, {
          lastAppliedMonth: null
        }]
      },
      data: {
        lastAppliedMonth: month,
        installmentsPaid: item.installmentsTotal > 0 ? {
          increment: 1
        } : undefined
      }
    });
    if (result.count === 0) continue;
    const day = Math.min(item.dayOfMonth, 28);
    let merchant = item.merchant;
    const installmentsPaidNow = item.installmentsTotal > 0 ? installmentsPaidBefore + 1 : 0;
    if (item.installmentsTotal > 0) {
      merchant = `${item.merchant} (cuota ${installmentsPaidNow}/${item.installmentsTotal})`;
    }
    await prisma.transaction.create({
      data: {
        userId,
        source: "recurring",
        provider: "Gasto fijo",
        merchant,
        amount: item.amount,
        date: `${month}-${String(day).padStart(2, "0")}`,
        month,
        category: item.category,
        txType: "expense",
        status: "confirmed",
        confidence: 1.0,
        ruleUsed: "recurring"
      }
    });
    if (item.installmentsTotal > 0 && installmentsPaidNow >= item.installmentsTotal) {
      await prisma.recurringExpense.update({
        where: {
          id: item.id
        },
        data: {
          active: false
        }
      });
    }
    created += 1;
  }
  return created;
}
export async function monthlyCommitted(userId) {
  const items = await prisma.recurringExpense.findMany({
    where: {
      userId,
      active: true
    }
  });
  return items.reduce((s, i) => s + i.amount, 0);
}
