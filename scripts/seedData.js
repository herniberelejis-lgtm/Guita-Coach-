/** Carga datos demo para el mes en curso. */
import { prisma } from "@guita-coach/db";
export async function seedDemoData() {
  const now = new Date();
  const year = now.getFullYear();
  const mon = now.getMonth() + 1;
  const month = `${year}-${String(mon).padStart(2, "0")}`;
  const pad = d => String(d).padStart(2, "0");
  await prisma.transaction.createMany({
    data: [{
      userId: 1,
      source: "mercadopago",
      txType: "income",
      amount: 1300000.0,
      currency: "ARS",
      date: `${year}-${pad(mon)}-01`,
      month,
      merchant: "Sueldo Empresa S.A.",
      provider: "MercadoPago",
      category: "ingreso",
      subcategory: "sueldo",
      status: "classified",
      confidence: 1.0,
      needsReview: false,
      rawReference: "demo_income_001"
    }, {
      userId: 1,
      source: "mercadopago",
      txType: "income",
      amount: 50000.0,
      currency: "ARS",
      date: `${year}-${pad(mon)}-10`,
      month,
      merchant: "Freelance Juan",
      provider: "MercadoPago",
      category: "ingreso",
      subcategory: "transferencia",
      status: "classified",
      confidence: 1.0,
      needsReview: true,
      rawReference: "demo_income_002"
    }]
  });
  const txs = [{
    merchant: "Ahorro automático",
    amount: 260000,
    category: "ahorro",
    subcategory: "Ahorro mensual",
    date: `${year}-${pad(mon)}-01`
  }, {
    merchant: "Alquiler",
    amount: 325000,
    category: "necesidades",
    subcategory: "Vivienda",
    date: `${year}-${pad(mon)}-01`
  }, {
    merchant: "Supermercado Coto",
    amount: 58000,
    category: "necesidades",
    subcategory: "Supermercado",
    date: `${year}-${pad(mon)}-04`
  }, {
    merchant: "SUBE – recarga",
    amount: 24500,
    category: "necesidades",
    subcategory: "Transporte",
    date: `${year}-${pad(mon)}-07`
  }, {
    merchant: "Netflix + Spotify",
    amount: 32500,
    category: "gustos",
    subcategory: "Streaming",
    date: `${year}-${pad(mon)}-09`
  }, {
    merchant: "Lo de Marcos – Restaurante",
    amount: 50000,
    category: "gustos",
    subcategory: "Restaurantes",
    date: `${year}-${pad(mon)}-10`
  }, {
    merchant: "Farmacia del Pueblo",
    amount: 15200,
    category: "necesidades",
    subcategory: "Salud",
    date: `${year}-${pad(mon)}-12`
  }, {
    merchant: "Gas + Luz",
    amount: 70800,
    category: "necesidades",
    subcategory: "Servicios",
    date: `${year}-${pad(mon)}-14`
  }, {
    merchant: "Zara",
    amount: 88000,
    category: "gustos",
    subcategory: "Compras",
    date: `${year}-${pad(mon)}-15`
  }, {
    merchant: "Supermercado DÍA",
    amount: 58000,
    category: "necesidades",
    subcategory: "Supermercado",
    date: `${year}-${pad(mon)}-16`
  }, {
    merchant: "Rappi",
    amount: 62000,
    category: "gustos",
    subcategory: "Delivery",
    date: `${year}-${pad(mon)}-17`
  }, {
    merchant: "Peluquería Cristal",
    amount: 25300,
    category: "gustos",
    subcategory: "Personal",
    date: `${year}-${pad(mon)}-18`
  }, {
    merchant: "Cantina del Centro",
    amount: 21400,
    category: "gustos",
    subcategory: "Restaurantes",
    date: `${year}-${pad(mon)}-18`
  }];
  await prisma.transaction.createMany({
    data: txs.map(t => ({
      userId: 1,
      provider: "Demo",
      currency: "ARS",
      month,
      status: "classified",
      confidence: 1.0,
      ruleUsed: "demo",
      source: "demo",
      txType: "expense",
      ...t
    }))
  });
  const rules = [["rappi", "gustos", "Delivery"], ["pedidosya", "gustos", "Delivery"], ["spotify", "gustos", "Streaming"], ["netflix", "gustos", "Streaming"], ["sube", "necesidades", "Transporte"], ["farmacia", "necesidades", "Salud"], ["coto", "necesidades", "Supermercado"], ["dia", "necesidades", "Supermercado"], ["carrefour", "necesidades", "Supermercado"], ["zara", "gustos", "Compras"], ["alquiler", "necesidades", "Vivienda"], ["ahorro", "ahorro", "Ahorro mensual"]];
  await prisma.categoryRule.createMany({
    data: rules.map(([pattern, category, subcategory]) => ({
      userId: 1,
      pattern,
      category,
      subcategory,
      priority: 1
    }))
  });
}
