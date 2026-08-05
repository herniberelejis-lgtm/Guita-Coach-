/** Motor de alertas. Corre después de cada transacción nueva. */
import { prisma } from "@guita-coach/db";
import { daysInMonth, settings } from "@guita-coach/shared";
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
async function alertExists(userId, type, category, since) {
  const found = await prisma.alert.findFirst({
    where: {
      userId,
      type,
      category,
      isRead: false,
      createdAt: {
        gte: since
      }
    }
  });
  return Boolean(found);
}
async function getAiAdvice(category, spent, limit, txs) {
  if (!settings.claudeEnabled) return "";
  try {
    const catTxs = txs.filter(t => t.category === category).map(t => [t.merchant, t.amount]);
    const top = [...catTxs].sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 5);
    const topStr = top.map(([m, a]) => `- ${m}: $${(a ?? 0).toLocaleString("es-AR")}`).join("\n");
    const prompt = `Sos un coach financiero argentino, cercano y directo.

El usuario lleva $${spent.toLocaleString("es-AR")} gastados en ${category} de un límite de $${limit.toLocaleString("es-AR")}.
Sus últimos gastos en esta franja:
${topStr}

Escribí UN consejo concreto y específico (máximo 2 oraciones, tono informal rioplatense).
No des consejos genéricos. Hacé referencia a los gastos reales.
No uses emojis. No uses "hola". Arrancá directo al punto.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.claudeApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });
    if (!r.ok) return "";
    const data = await r.json();
    return (data?.content?.[0]?.text ?? "").trim();
  } catch {
    return "";
  }
}
export async function runAlertEngine(userId) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const days = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const daysPassed = now.getDate();
  const daysRemaining = days - daysPassed;
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    }
  });
  if (!user || !user.monthlyIncome) return;
  const income = user.monthlyIncome;
  const limits = {
    necesidades: income * user.necesidadesPct / 100,
    gustos: income * user.gustosPct / 100,
    ahorro: income * user.ahorroPct / 100
  };
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      month
    }
  });
  const spent = {};
  for (const cat of Object.keys(limits)) {
    spent[cat] = txs.filter(t => t.category === cat).reduce((s, t) => s + (t.amount ?? 0), 0);
  }
  const oneDayAgo = new Date(now);
  oneDayAgo.setHours(0, 0, 0, 0);
  for (const [cat, limit] of Object.entries(limits)) {
    const s = spent[cat] || 0;
    const pct = limit > 0 ? s / limit : 0;
    if (pct >= 0.9) {
      if (!(await alertExists(userId, "threshold", cat, oneDayAgo))) {
        const remaining = limit - s;
        const msg = `${capitalize(cat)} casi en el límite. Te quedan $${remaining.toLocaleString("es-AR")} para ${daysRemaining} días.`;
        const aiMsg = await getAiAdvice(cat, s, limit, txs);
        await prisma.alert.create({
          data: {
            userId,
            type: "threshold",
            category: cat,
            message: msg,
            aiAdvice: aiMsg,
            severity: "critical"
          }
        });
      }
    } else if (pct >= 0.75) {
      if (!(await alertExists(userId, "threshold", cat, oneDayAgo))) {
        const msg = `Ojo, venís rápido con ${cat}. Estás al ${Math.round(pct * 100)}% y quedan ${daysRemaining} días.`;
        const aiMsg = await getAiAdvice(cat, s, limit, txs);
        await prisma.alert.create({
          data: {
            userId,
            type: "threshold",
            category: cat,
            message: msg,
            aiAdvice: aiMsg,
            severity: "warning"
          }
        });
      }
    } else if (daysPassed > 0) {
      const dailyRate = s / daysPassed;
      const projection = s + dailyRate * daysRemaining;
      if (projection > limit && !(await alertExists(userId, "projection", cat, oneDayAgo))) {
        const msg = `Si seguís así, ${cat} va a pasar el límite antes de fin de mes.`;
        await prisma.alert.create({
          data: {
            userId,
            type: "projection",
            category: cat,
            message: msg,
            severity: "warning"
          }
        });
      }
    }
  }
}
