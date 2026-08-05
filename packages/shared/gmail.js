/** Gmail OAuth + parsing de emails de pago. */
import { settings } from "./config.js";
import { fromText as paymentFromText } from "./paymentMethod.js";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const INCOME_PATTERNS = /recibiste|te acreditaron|transferencia recibida|deposito recibido|acreditaci[oó]n|you received|payment received|funds received|money received/i;
function isIncomeEmail(text) {
  return INCOME_PATTERNS.test(text);
}
function extractSenderName(from) {
  const match = from.match(/^([^<]+)</);
  return match ? match[1].trim() : from;
}
export function getOauthUrl(state) {
  const params = new URLSearchParams({
    client_id: settings.googleClientId,
    redirect_uri: `${settings.appUrl}/api/auth/gmail/callback`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export async function exchangeCode(code) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: settings.googleClientId,
      client_secret: settings.googleClientSecret,
      redirect_uri: `${settings.appUrl}/api/auth/gmail/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!r.ok) throw new Error(`Google token error ${r.status}`);
  return r.json();
}
export async function fetchPaymentEmails(accessToken, maxResults = 400) {
  const query = "(pago OR compra OR factura OR confirmación OR pagaste OR recibiste OR acreditaron OR transferencia OR débito OR cobro OR " + "invoice OR receipt OR payment OR charged OR subscription OR billing OR your order OR amount due OR total due) newer_than:180d";
  const headers = {
    Authorization: `Bearer ${accessToken}`
  };
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("maxResults", String(maxResults));
  const listRes = await fetch(listUrl, {
    headers
  });
  if (!listRes.ok) throw new Error(`Gmail API error ${listRes.status}: ${await listRes.text()}`);
  const listData = await listRes.json();
  const messages = listData.messages || [];
  const results = [];
  for (const msg of messages.slice(0, 50)) {
    const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`);
    detailUrl.searchParams.set("format", "full");
    const detailRes = await fetch(detailUrl, {
      headers
    });
    if (detailRes.ok) {
      const detail = await detailRes.json();
      const parsed = parseEmail(detail, msg.id);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}
const PROMO_PATTERNS = /hasta \$|gan[aá]|sorteo|descuento|off\b|promo|oferta|cuotas sin inter[eé]s|suscribite|newsletter|no te pierdas|aprovech[aá]|beneficio|reintegro de hasta|unsubscribe|special offer|limited time|% off|sale ends|free trial|upgrade now/i;
const TX_AMOUNT = /(?:pagaste|compra(?:ste)? (?:aprobada |de )?|se debit[oó]|d[eé]bito de|pago (?:de|por|realizado por)|abonaste|total(?: a pagar)?:?|consumo de|factura por|transferiste|enviaste|amount charged|you (?:were )?charged|total(?: amount)?:?|amount due:?|invoice total:?|payment of|charged to|billed(?: amount)?:?|subscription fee:?|plan:?\s*\w+\s*[-–])[^\d$USD]{0,25}(?:USD\s*|US\$\s*|\$\s*|ARS\s*)?([\d.,]+)/gi;
const INCOME_AMOUNT = /(?:recibiste|te acreditaron|te transfirieron|acreditaci[oó]n de|dep[oó]sito de|you received|payment received|funds received|credited to your)[^\d$]{0,20}(?:USD\s*|US\$\s*|\$\s*|ARS\s*)?([\d.,]+)/gi;
const MAX_PLAUSIBLE = 20_000_000;
function isPromotional(headers, text) {
  if ("list-unsubscribe" in headers) return true;
  return PROMO_PATTERNS.test(text);
}
function parseEmail(msg, gmailId = "") {
  const headerList = msg.payload?.headers || [];
  const headers = {};
  for (const h of headerList) headers[h.name.toLowerCase()] = h.value;
  const subject = headers.subject || "";
  const dateStr = headers.date || "";
  const sender = headers.from || "";
  const snippet = msg.snippet || "";
  const fullText = extractBody(msg);
  const text = `${subject}\n${snippet}\n${fullText}`;
  const uniqueId = gmailId ? `gmail_${gmailId}` : subject;
  if (isPromotional(headers, text)) return null;
  if (isIncomeEmail(text)) {
    const matches = [...text.matchAll(INCOME_AMOUNT)].map(m => parseAmountAr(m[1]));
    const amount = matches.length ? Math.max(...matches) : 0;
    if (amount >= 100 && amount <= MAX_PLAUSIBLE) {
      return {
        merchant: extractSenderName(sender) || "Ingreso Gmail",
        amount,
        date: parseEmailDate(dateStr),
        provider: "Gmail",
        source: "gmail",
        tx_type: "income",
        raw_reference: uniqueId,
        confidence: 0.85
      };
    }
  }
  const paymentMethod = paymentFromText(text);
  let result = tryParseMercadopago(text, sender, dateStr);
  if (result) {
    result.tx_type = result.tx_type || "expense";
    result.raw_reference = uniqueId;
    result.payment_method = paymentMethod;
    return result;
  }
  result = tryParseEnglish(text, sender, dateStr);
  if (result) {
    result.tx_type = result.tx_type || "expense";
    result.raw_reference = uniqueId;
    result.payment_method = paymentMethod;
    return result;
  }
  result = tryParseGeneric(text, subject, sender, dateStr);
  if (result) {
    result.tx_type = result.tx_type || "expense";
    result.raw_reference = uniqueId;
    result.payment_method = paymentMethod;
  }
  return result;
}
function extractBody(msg) {
  const parts = msg.payload?.parts || [];
  for (const part of parts) {
    if (part.mimeType === "text/plain") {
      const data = part.body?.data;
      if (data) {
        try {
          return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        } catch {
          return "";
        }
      }
    }
  }
  return "";
}
function tryParseMercadopago(text, sender, dateStr) {
  if (!sender.toLowerCase().includes("mercadopago") && !text.toLowerCase().includes("mercadopago")) return null;
  const m = text.match(/(?:pagaste|pago de)\s+\$\s?([\d.,]+)\s+(?:en|a)\s+(.+?)(?:\.|,|\n|$)/i);
  if (m) {
    return {
      merchant: m[2].trim(),
      amount: parseAmountAr(m[1]),
      date: parseEmailDate(dateStr),
      provider: "Mercado Pago",
      source: "gmail",
      raw_reference: "",
      confidence: 0.92
    };
  }
  return null;
}
function tryParseEnglish(text, sender, dateStr) {
  if (!/\b(invoice|receipt|payment|charged|subscription|billing|amount due|total due|your plan)\b/i.test(text)) return null;
  const usdPattern = /(?:total|amount|charged?|payment|invoice|subtotal|plan)[^\d$USD]{0,30}(?:USD\s*|US\$\s*|\$\s*)([\d,]+\.?\d{0,2})/gi;
  const matches = [...text.matchAll(usdPattern)].map(m => parseAmountUsd(m[1]));
  const valid = matches.filter(a => a >= 1 && a <= 10000);
  if (!valid.length) return null;
  const amount = Math.max(...valid);
  const merchant = extractMerchant(sender, "");
  return {
    merchant: merchant || "Servicio internacional",
    amount,
    currency: "USD",
    date: parseEmailDate(dateStr),
    provider: merchant || "Email",
    source: "gmail",
    raw_reference: "",
    confidence: 0.8,
    needs_review: false
  };
}
function tryParseGeneric(text, subject, sender, dateStr) {
  const matches = [...text.matchAll(TX_AMOUNT)].map(m => parseAmountAr(m[1]));
  if (!matches.length) return null;
  const amount = Math.max(...matches);
  if (amount < 100 || amount > MAX_PLAUSIBLE) return null;
  const merchant = extractMerchant(sender, subject);
  return {
    merchant: merchant || "Gasto desconocido",
    amount,
    date: parseEmailDate(dateStr),
    provider: merchant || "Email",
    source: "gmail",
    raw_reference: subject,
    confidence: 0.6,
    needs_review: true
  };
}
function parseAmountAr(s) {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}
function parseAmountUsd(s) {
  s = s.trim();
  if (s.includes(",") && s.includes(".")) {
    return s.indexOf(",") < s.indexOf(".") ? parseFloat(s.replace(/,/g, "")) : parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat((s.match(/\./g)?.length || 0) > 1 ? s.replace(/\./g, "") : s);
}
const KNOWN_DOMAINS = {
  mercadopago: "Mercado Pago",
  rappi: "Rappi",
  pedidosya: "PedidosYa",
  edenor: "EDENOR",
  metrogas: "METROGAS",
  netflix: "Netflix",
  spotify: "Spotify",
  amazon: "Amazon",
  anthropic: "Claude / Anthropic",
  google: "Google",
  apple: "Apple",
  microsoft: "Microsoft",
  openai: "OpenAI",
  github: "GitHub",
  digitalocean: "DigitalOcean",
  railway: "Railway",
  vercel: "Vercel",
  paypal: "PayPal",
  stripe: "Stripe",
  uber: "Uber",
  cabify: "Cabify",
  flow: "Flow",
  personal: "Personal",
  claro: "Claro",
  movistar: "Movistar",
  fibertel: "Fibertel",
  telecentro: "Telecentro",
  directv: "DirecTV"
};
function extractMerchant(sender, subject) {
  const domainMatch = sender.toLowerCase().match(/@([a-z0-9-]+)\./);
  if (domainMatch) {
    const domain = domainMatch[1];
    return KNOWN_DOMAINS[domain] || domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  return subject.split("–")[0].split("-")[0].trim().slice(0, 40);
}
function parseEmailDate(dateStr) {
  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}
