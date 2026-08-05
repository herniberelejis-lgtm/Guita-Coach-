/** Sync endpoints — Gmail, Mercado Pago, Plaid, y Prometeo. */
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "@guita-coach/db";
import { requireAuth, ah, HttpError, detectSplitCandidates, encrypt, decrypt, gmailSvc, mpSvc } from "@guita-coach/shared";
import { findCrossSourceDuplicate, markDuplicatesAndTransfers } from "../services/dedup.js";
import { classify } from "../services/classifier.js";
import { runAlertEngine } from "../services/alertEngine.js";
import { plaidClient } from "../services/plaidSync.js";
import { getPrometeoClient } from "../services/prometeoApi.js";
import { parseMpCsv } from "../services/csvImport.js";
export const syncRouter = Router();
syncRouter.use(requireAuth);
const upload = multer({
  limits: {
    fileSize: 5_000_000
  }
});
async function saveTransactionItem(item, userId) {
  const rawRef = String(item.id || item.raw_reference || "");
  const source = item.source || "";
  if (rawRef) {
    const exists = await prisma.transaction.findFirst({
      where: {
        userId,
        rawReference: rawRef,
        source
      }
    });
    if (exists) return false;
  }
  const dup = await findCrossSourceDuplicate(userId, item);
  const txType = item.tx_type || "expense";
  const paymentMethod = item.payment_method || "";
  if (txType === "income") {
    await prisma.transaction.create({
      data: {
        userId,
        source,
        txType: "income",
        amount: item.amount,
        currency: item.currency || "ARS",
        date: item.date,
        month: item.month || item.date.slice(0, 7),
        merchant: item.merchant || "",
        provider: item.provider || "",
        category: "ingreso",
        subcategory: "",
        status: "confirmed",
        confidence: 1.0,
        paymentMethod,
        needsReview: item.needs_review || false,
        rawReference: rawRef,
        isDuplicate: dup !== null
      }
    });
  } else {
    const result = await classify(item.merchant || "", item.amount || 0, source, userId);
    await prisma.transaction.create({
      data: {
        userId,
        source,
        txType: "expense",
        amount: item.amount,
        currency: item.currency || "ARS",
        date: item.date,
        month: item.month || item.date.slice(0, 7),
        merchant: item.merchant || "",
        provider: item.provider || "",
        category: result.category || "",
        subcategory: result.subcategory || "",
        status: "confirmed",
        confidence: result.confidence ?? 0.7,
        ruleUsed: result.rule_used,
        aiReason: result.ai_reason,
        paymentMethod,
        needsReview: item.needs_review || result.needs_review || false,
        rawReference: rawRef,
        isDuplicate: dup !== null
      }
    });
  }
  return true;
}
async function saveTransactions(items, userId) {
  let saved = 0;
  for (const item of items) {
    if (await saveTransactionItem(item, userId)) saved += 1;
  }
  return saved;
}
syncRouter.post("/gmail", ah(async (req, res) => {
  const user = req.user;
  const conn = await prisma.connection.findFirst({
    where: {
      userId: user.id,
      provider: "gmail"
    }
  });
  if (!conn || conn.status !== "connected" || !conn.accessToken) {
    throw new HttpError(400, "Gmail no conectado. Conectalo desde Configuración.");
  }
  let items;
  try {
    items = await gmailSvc.fetchPaymentEmails(decrypt(conn.accessToken));
  } catch (e) {
    throw new HttpError(502, `Error al leer Gmail: ${e instanceof Error ? e.message : String(e)}`);
  }
  const saved = await saveTransactions(items, user.id);
  await prisma.connection.update({
    where: {
      id: conn.id
    },
    data: {
      lastSync: new Date()
    }
  });
  const flagged = await markDuplicatesAndTransfers(user.id);
  const splits = await detectSplitCandidates(user.id);
  void runAlertEngine(user.id);
  res.json({
    ok: true,
    fetched: items.length,
    saved,
    flagged,
    split_suggestions: splits
  });
}));
syncRouter.post("/mp", ah(async (req, res) => {
  const user = req.user;
  const conn = await prisma.connection.findFirst({
    where: {
      userId: user.id,
      provider: "mercadopago"
    }
  });
  if (!conn || conn.status !== "connected" || !conn.accessToken) {
    throw new HttpError(400, "Mercado Pago no conectado. Conectalo desde Configuración.");
  }
  let items;
  try {
    items = await mpSvc.fetchMovements(decrypt(conn.accessToken));
  } catch (e) {
    throw new HttpError(502, `Error al leer Mercado Pago: ${e instanceof Error ? e.message : String(e)}`);
  }
  const saved = await saveTransactions(items, user.id);
  await prisma.connection.update({
    where: {
      id: conn.id
    },
    data: {
      lastSync: new Date()
    }
  });
  const flagged = await markDuplicatesAndTransfers(user.id);
  const splits = await detectSplitCandidates(user.id);
  void runAlertEngine(user.id);
  res.json({
    ok: true,
    fetched: items.length,
    saved,
    flagged,
    split_suggestions: splits
  });
}));
syncRouter.post("/csv", upload.single("file"), ah(async (req, res) => {
  const user = req.user;
  if (!req.file) throw new HttpError(400, "Archivo requerido");
  if (req.file.size > 5_000_000) throw new HttpError(413, "Archivo muy grande (máximo 5 MB)");
  let items;
  try {
    items = parseMpCsv(req.file.buffer);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : String(e));
  }
  const saved = await saveTransactions(items, user.id);
  const flagged = await markDuplicatesAndTransfers(user.id);
  const splits = await detectSplitCandidates(user.id);
  void runAlertEngine(user.id);
  res.json({
    ok: true,
    fetched: items.length,
    saved,
    flagged,
    split_suggestions: splits
  });
}));
syncRouter.get("/status", ah(async (req, res) => {
  const conns = await prisma.connection.findMany({
    where: {
      userId: req.user.id
    }
  });
  const out = {};
  for (const c of conns) {
    out[c.provider] = {
      status: c.status,
      last_sync: c.lastSync ? c.lastSync.toISOString() : null
    };
  }
  res.json(out);
}));

// === PLAID ===

syncRouter.post("/plaid/link_token", ah(async (req, res) => {
  const user = req.user;
  const linkToken = await plaidClient.createLinkToken(user.id, user.email || "");
  if (!linkToken) throw new HttpError(400, "Error creando link token de Plaid");
  res.json({
    link_token: linkToken
  });
}));
const ExchangeTokenSchema = z.object({
  public_token: z.string()
});
syncRouter.post("/plaid/exchange_token", ah(async (req, res) => {
  const user = req.user;
  const {
    public_token
  } = ExchangeTokenSchema.parse(req.body);
  const accessToken = await plaidClient.exchangeToken(public_token);
  if (!accessToken) throw new HttpError(400, "Error intercambiando token");
  const connection = await prisma.connection.findFirst({
    where: {
      userId: user.id,
      provider: "plaid"
    }
  });
  if (connection) {
    await prisma.connection.update({
      where: {
        id: connection.id
      },
      data: {
        accessToken: encrypt(accessToken),
        status: "connected",
        lastSync: new Date()
      }
    });
  } else {
    await prisma.connection.create({
      data: {
        userId: user.id,
        provider: "plaid",
        accessToken: encrypt(accessToken),
        status: "connected",
        lastSync: new Date()
      }
    });
  }
  res.json({
    status: "connected",
    message: "Banco conectado exitosamente"
  });
}));
syncRouter.post("/plaid/sync", ah(async (req, res) => {
  const user = req.user;
  const connection = await prisma.connection.findFirst({
    where: {
      userId: user.id,
      provider: "plaid"
    }
  });
  if (!connection) throw new HttpError(400, "Plaid no está conectado");
  const transactions = await plaidClient.getTransactions(decrypt(connection.accessToken), 90);
  const items = transactions.map(txn => ({
    id: txn.transaction_id,
    date: txn.date,
    amount: Math.abs(Number(txn.amount || 0)),
    merchant: txn.name || "Transacción",
    tx_type: Number(txn.amount || 0) > 0 ? "income" : "expense",
    source: "plaid",
    payment_method: "Transferencia",
    currency: "ARS",
    raw_reference: txn.transaction_id || ""
  }));
  const saved = await saveTransactions(items, user.id);
  await prisma.connection.update({
    where: {
      id: connection.id
    },
    data: {
      lastSync: new Date()
    }
  });
  const flagged = await markDuplicatesAndTransfers(user.id);
  const splits = await detectSplitCandidates(user.id);
  void runAlertEngine(user.id);
  res.json({
    ok: true,
    fetched: transactions.length,
    saved,
    flagged,
    split_suggestions: splits
  });
}));

// === PROMETEO ===

syncRouter.get("/prometeo/providers", ah(async (_req, res) => {
  const client = getPrometeoClient();
  if (!client) throw new HttpError(400, "Prometeo no configurado");
  const providers = await client.listProviders();
  res.json({
    providers
  });
}));
const PrometeoLoginSchema = z.object({
  provider: z.string(),
  username: z.string(),
  password: z.string(),
  doc_type: z.string().default("C")
});
syncRouter.post("/prometeo/login", ah(async (req, res) => {
  const user = req.user;
  const client = getPrometeoClient();
  if (!client) throw new HttpError(400, "Prometeo no configurado");
  const body = PrometeoLoginSchema.parse(req.body);
  const result = await client.login(body.provider, body.username, body.password, body.doc_type);
  if (!result || result.status === "error") {
    throw new HttpError(400, result?.message || "Error conectando al banco");
  }
  const status = result.status;
  const sessionKey = result.session_key;
  if (status === "wrong_credentials") throw new HttpError(401, "Usuario o contraseña incorrectos");
  if (status !== "logged_in" && status !== "select_client") {
    throw new HttpError(400, `Estado inesperado: ${status}. ${result.message || ""}`);
  }
  const conn = await prisma.connection.findFirst({
    where: {
      userId: user.id,
      provider: "prometeo"
    }
  });
  if (conn) {
    await prisma.connection.update({
      where: {
        id: conn.id
      },
      data: {
        accessToken: encrypt(sessionKey),
        status: "connected",
        lastSync: new Date()
      }
    });
  } else {
    await prisma.connection.create({
      data: {
        userId: user.id,
        provider: "prometeo",
        accessToken: encrypt(sessionKey),
        status: "connected",
        lastSync: new Date()
      }
    });
  }
  res.json({
    status: "connected",
    session_key: sessionKey,
    bank_status: status
  });
}));
syncRouter.post("/prometeo/sync", ah(async (req, res) => {
  const user = req.user;
  const client = getPrometeoClient();
  if (!client) throw new HttpError(400, "Prometeo no configurado");
  const conn = await prisma.connection.findFirst({
    where: {
      userId: user.id,
      provider: "prometeo"
    }
  });
  if (!conn || conn.status !== "connected") throw new HttpError(400, "Prometeo no conectado. Conectá tu banco primero.");
  const sessionKey = decrypt(conn.accessToken);
  const accounts = await client.getAccounts(sessionKey);
  if (!accounts.length) throw new HttpError(400, "No se pudieron obtener las cuentas. La sesión puede haber expirado.");
  const allTxns = [];
  for (const acc of accounts) {
    const number = acc.number || acc.account_id || "";
    const currency = acc.currency || "ARS";
    if (number) {
      const movs = await client.getMovements(sessionKey, number, currency, 90);
      allTxns.push(...movs);
    }
  }
  const items = allTxns.map(txn => {
    const amount = Number(txn.amount || 0);
    return {
      id: txn.transaction_id,
      date: txn.date,
      amount: Math.abs(amount),
      merchant: txn.name || "Transacción",
      tx_type: amount < 0 ? "income" : "expense",
      source: "prometeo",
      payment_method: "Transferencia Bancaria",
      currency: txn.iso_currency_code || "ARS",
      raw_reference: txn.transaction_id || ""
    };
  });
  const saved = await saveTransactions(items, user.id);
  await prisma.connection.update({
    where: {
      id: conn.id
    },
    data: {
      lastSync: new Date()
    }
  });
  const flagged = await markDuplicatesAndTransfers(user.id);
  const splits = await detectSplitCandidates(user.id);
  void runAlertEngine(user.id);
  res.json({
    ok: true,
    fetched: allTxns.length,
    saved,
    accounts: accounts.length,
    flagged,
    split_suggestions: splits
  });
}));
