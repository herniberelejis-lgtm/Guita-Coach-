/** Importador del CSV/Excel de actividad de Mercado Pago (estado de cuenta). */
import crypto from "node:crypto";
const HEADER_HINTS = {
  date: ["fecha", "date", "día"],
  description: ["descripci", "concepto", "detalle", "operaci", "transaction_type", "tipo"],
  amount: ["monto", "valor", "importe", "amount", "transaction_amount"],
  id: ["id", "referencia", "nro", "número de operaci", "operation"]
};
const DATE_PATTERNS = [[/^(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}`], [/^(\d{2})\/(\d{2})\/(\d{4})/, m => `${m[3]}-${m[2]}-${m[1]}`], [/^(\d{2})-(\d{2})-(\d{4})/, m => `${m[3]}-${m[2]}-${m[1]}`]];
function parseDate(raw) {
  raw = (raw || "").trim();
  for (const [pattern, build] of DATE_PATTERNS) {
    const m = raw.match(pattern);
    if (m) return build(m);
  }
  return null;
}
function parseAmount(raw) {
  raw = (raw || "").trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!raw) return null;
  const negative = raw.startsWith("-") || raw.startsWith("(") && raw.endsWith(")");
  raw = raw.replace(/^[()\-+]+|[()\-+]+$/g, "");
  if (raw.includes(",") && raw.includes(".")) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (raw.includes(",")) {
    const idx = raw.lastIndexOf(",");
    const head = raw.slice(0, idx);
    const tail = raw.slice(idx + 1);
    raw = tail.length <= 2 ? `${head.replace(/\./g, "")}.${tail}` : raw.replace(/,/g, "");
  }
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}
function findColumns(header) {
  const cols = {};
  header.forEach((cell, idx) => {
    const cellL = (cell || "").toLowerCase().trim();
    for (const [field, hints] of Object.entries(HEADER_HINTS)) {
      if (!(field in cols) && hints.some(h => cellL.includes(h))) {
        cols[field] = idx;
      }
    }
  });
  return "date" in cols && "amount" in cols ? cols : null;
}
function decodeBuffer(content) {
  // utf-8 with BOM strip; fallback latin1
  let text = content.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\uFFFD")) {
    text = content.toString("latin1");
  }
  return text;
}
function splitCsvLine(line, delimiter) {
  // Simple splitter (no embedded-quote CSVs expected in MP export).
  return line.split(delimiter).map(c => c.replace(/^"|"$/g, "").trim());
}
export function parseMpCsv(content) {
  const text = decodeBuffer(content);
  if (!text) throw new Error("No se pudo leer el archivo: codificación desconocida");
  const delimiter = (text.match(/;/g)?.length || 0) > (text.match(/,/g)?.length || 0) ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const rows = lines.map(l => splitCsvLine(l, delimiter));
  let cols = null;
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    cols = findColumns(rows[i]);
    if (cols) {
      start = i + 1;
      break;
    }
  }
  if (!cols) {
    throw new Error("No encontré las columnas de fecha y monto. Asegurate de subir el reporte de actividad de Mercado Pago.");
  }
  const items = [];
  for (const row of rows.slice(start)) {
    const maxIdx = Math.max(...Object.values(cols));
    if (row.length <= maxIdx) continue;
    const date = parseDate(row[cols.date]);
    const amount = parseAmount(row[cols.amount]);
    if (!date || amount === null || amount === 0) continue;
    const description = "description" in cols ? row[cols.description].trim() : "";
    const opId = "id" in cols ? row[cols.id].trim() : "";
    const ref = opId ? `mpcsv_${opId}` : "mpcsv_" + crypto.createHash("sha1").update(`${date}|${amount}|${description}`).digest("hex").slice(0, 16);
    items.push({
      id: ref,
      source: "mp_csv",
      tx_type: amount > 0 ? "income" : "expense",
      amount: Math.abs(amount),
      currency: "ARS",
      date,
      month: date.slice(0, 7),
      merchant: description || "Movimiento MP",
      provider: "MP (estado de cuenta)",
      needs_review: !description,
      raw_reference: ref
    });
  }
  return items;
}
