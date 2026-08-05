/** Clasificación de gastos:
 *   1. Reglas del usuario (prioridad máxima)
 *   2. Reglas globales predefinidas
 *   3. IA (Gemini/Claude) si confianza de reglas < 85%
 */
import { prisma } from "@guita-coach/db";
import { aiProvider } from "@guita-coach/shared";
export const GLOBAL_RULES = [["rappi", "gustos", "Delivery"], ["pedidosya", "gustos", "Delivery"], ["glovo", "gustos", "Delivery"], ["spotify", "gustos", "Streaming"], ["netflix", "gustos", "Streaming"], ["disney", "gustos", "Streaming"], ["hbo", "gustos", "Streaming"], ["amazon prime", "gustos", "Streaming"], ["sube", "necesidades", "Transporte"], ["cabify", "necesidades", "Transporte"], ["uber", "necesidades", "Transporte"], ["farmacia", "necesidades", "Salud"], ["coto", "necesidades", "Supermercado"], ["dia", "necesidades", "Supermercado"], ["carrefour", "necesidades", "Supermercado"], ["jumbo", "necesidades", "Supermercado"], ["disco", "necesidades", "Supermercado"], ["supermercado", "necesidades", "Supermercado"], ["alquiler", "necesidades", "Vivienda"], ["edenor", "necesidades", "Servicios"], ["metrogas", "necesidades", "Servicios"], ["aysa", "necesidades", "Servicios"], ["fibertel", "necesidades", "Servicios"], ["claro", "necesidades", "Servicios"], ["personal", "necesidades", "Servicios"], ["movistar", "necesidades", "Servicios"], ["telecentro", "necesidades", "Servicios"], ["zara", "gustos", "Compras"], ["h&m", "gustos", "Compras"], ["adidas", "gustos", "Compras"], ["ahorro", "ahorro", "Ahorro mensual"], ["restaurante", "gustos", "Restaurantes"], ["cantina", "gustos", "Restaurantes"], ["peluqueria", "gustos", "Personal"], ["peluquería", "gustos", "Personal"], ["veterinaria", "necesidades", "Salud"]];
function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
export async function classifyByRules(merchant, userId = 1) {
  const n = normalize(merchant || "");
  const userRules = await prisma.categoryRule.findMany({
    where: {
      userId
    },
    orderBy: {
      priority: "desc"
    }
  });
  for (const rule of userRules) {
    if (n.includes(normalize(rule.pattern))) {
      return {
        category: rule.category || "",
        subcategory: rule.subcategory || "",
        confidence: 0.95,
        rule_used: `user:${rule.pattern}`
      };
    }
  }
  for (const [pattern, category, subcategory] of GLOBAL_RULES) {
    if (n.includes(pattern)) {
      return {
        category,
        subcategory,
        confidence: 0.85,
        rule_used: `global:${pattern}`
      };
    }
  }
  return null;
}
export async function classify(merchant, amount, source, userId = 1) {
  const ruleResult = await classifyByRules(merchant, userId);
  if (ruleResult && ruleResult.confidence >= 0.85) return ruleResult;
  const aiResult = await aiProvider.classify(merchant, amount, source);
  if ((aiResult.confidence || 0) >= 0.85) return aiResult;
  if (ruleResult) return ruleResult;
  return {
    ...aiResult,
    needs_review: true
  };
}
