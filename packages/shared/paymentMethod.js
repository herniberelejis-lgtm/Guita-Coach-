/** Detección y normalización del medio de pago de un gasto.
 * Valores normalizados: credito | debito | qr | transferencia | efectivo | otro
 */
export const VALID_METHODS = new Set(["credito", "debito", "qr", "transferencia", "efectivo", "otro"]);
export const METHOD_LABELS = {
  credito: "Tarjeta de crédito",
  debito: "Tarjeta de débito",
  qr: "QR / billetera",
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  otro: "Otro"
};
const MP_TYPE_MAP = {
  credit_card: "credito",
  debit_card: "debito",
  prepaid_card: "debito",
  bank_transfer: "transferencia",
  money_transfer: "transferencia",
  crypto_transfer: "transferencia",
  account_money: "qr",
  digital_wallet: "qr",
  digital_currency: "qr",
  ticket: "efectivo",
  atm: "efectivo",
  voucher_card: "efectivo"
};
const TEXT_PATTERNS = [["credito", /tarjeta\s+de\s+cr[eé]dito|cr[eé]dito|credit\s*card/i], ["debito", /tarjeta\s+de\s+d[eé]bito|d[eé]bito|debit\s*card/i], ["qr", /\bqr\b|c[oó]digo\s+qr|billetera|saldo\s+en\s+cuenta/i], ["transferencia", /transferencia|transfer(?:iste|encia)?|\bcvu\b|\bcbu\b/i], ["efectivo", /efectivo|cash|pago\s*f[aá]cil|rapipago/i]];
export function normalizeMethod(value) {
  const v = (value || "").trim().toLowerCase();
  return VALID_METHODS.has(v) ? v : "";
}
export function fromMp(paymentTypeId, paymentMethodId) {
  const key = (paymentTypeId || "").trim().toLowerCase();
  if (key in MP_TYPE_MAP) return MP_TYPE_MAP[key];
  const pm = (paymentMethodId || "").trim().toLowerCase();
  if (pm.includes("transfer") || pm === "cvu" || pm === "cbu") return "transferencia";
  if (pm.includes("debin")) return "transferencia";
  if (pm.includes("account_money")) return "qr";
  return "";
}
export function fromText(text) {
  if (!text) return "";
  for (const [method, pattern] of TEXT_PATTERNS) {
    if (pattern.test(text)) return method;
  }
  return "";
}
