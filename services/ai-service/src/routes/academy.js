/** Guita Coach Academy — contenido educativo fijo, priorizado por perfil del usuario. */
import { Router } from "express";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah } from "@guita-coach/shared";
import { TOPICS, CATEGORY_LABELS, GLOSSARY } from "../services/academyContent.js";
export const academyRouter = Router();
academyRouter.use(requireAuth);
function buildProfile(user, investments) {
  const assetTypes = new Set(investments.map(i => i.assetType).filter(Boolean));
  return {
    is_beginner: investments.length === 0,
    crypto_only: assetTypes.size > 0 && assetTypes.size === 1 && assetTypes.has("crypto"),
    low_buffer: (user.ahorroPct || 0) < 10,
    variable_income: Boolean(user.incomeIsVariable),
    diversified: assetTypes.size >= 2
  };
}
function score(topic, profile) {
  return topic.tags.reduce((s, tag) => s + (profile[tag] ? 1 : 0), 0);
}
academyRouter.get("/", ah(async (req, res) => {
  const user = req.user;
  const investments = await prisma.investment.findMany({
    where: {
      userId: user.id,
      status: "open"
    },
    select: {
      assetType: true
    }
  });
  const profile = buildProfile(user, investments);
  const scored = TOPICS.map(t => ({
    ...t,
    score: score(t, profile)
  }));
  let recommended = scored.filter(t => t.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  if (!recommended.length) recommended = scored.filter(t => t.category === "primeros_pasos");
  const byCategory = new Map();
  for (const t of scored) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category).push(t);
  }
  const categories = [...byCategory.entries()].map(([cat, topics]) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] || cat,
    topics
  }));
  res.json({
    recommended: recommended.map(({
      score: _s,
      ...rest
    }) => rest),
    categories,
    glossary: GLOSSARY
  });
}));
