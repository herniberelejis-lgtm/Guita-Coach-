/** Investment CSV/XLSX parser for Argentine brokers: Cocos Capital, Invertir
 * Online, Bull Market, y PPI (Portfolio Personal Inversiones).
 */
import * as XLSX from "xlsx";
const DATE_PATTERNS = [[/^(\d{4})-(\d{1,2})-(\d{1,2})/, m => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`], [/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, m => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`], [/^(\d{1,2})-(\d{1,2})-(\d{4})/, m => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`]];
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
    if (head && /^\d+$/.test(head)) {
      raw = `${head.replace(/\./g, "")}.${tail}`;
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (raw.includes(".")) {
    const idx = raw.lastIndexOf(".");
    const head = raw.slice(0, idx);
    const tail = raw.slice(idx + 1);
    if (tail.length <= 2 && head && /^\d+$/.test(head)) {
      raw = `${head}.${tail}`;
    } else {
      raw = raw.replace(/\./g, "");
    }
  }
  const value = parseFloat(raw);
  if (Number.isNaN(value)) return null;
  return negative ? -value : value;
}
function readText(buf) {
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes("\uFFFD")) text = buf.toString("latin1");
  return text || null;
}
function detectDelimiter(text) {
  const firstLines = text.split("\n").slice(0, 5).join("\n");
  return (firstLines.match(/;/g)?.length || 0) > (firstLines.match(/,/g)?.length || 0) ? ";" : ",";
}
function csvToRows(text, delimiter) {
  return text.split(/\r?\n/).filter(l => l.length > 0).map(line => line.split(delimiter).map(c => c.replace(/^"|"$/g, "").trim()));
}
function headersLower(row) {
  return row.map(c => (c || "").toLowerCase().trim());
}
function isCocosAccountStatement(headers) {
  return headers.includes("nroticket") && headers.includes("tipooperacion") && headers.includes("instrumento");
}
export function detectBroker(csvBytes) {
  const text = readText(csvBytes);
  if (!text) return null;
  const delimiter = detectDelimiter(text);
  const rows = csvToRows(text, delimiter);
  if (!rows.length) return null;
  const headers = headersLower(rows[0]);
  if (isCocosAccountStatement(headers)) return "cocos_capital";
  if (headers.includes("especie") && headers.includes("comision")) return "cocos_capital";
  if (headers.includes("isin") && headers.includes("liquidacion")) return "invertir_online";
  if (headers.includes("simbolo")) return "bull_market";
  if (headers.includes("instrumento") && headers.includes("tipooperacion")) return "bull_market";
  return null;
}
function cocosAccountStatementTxType(tipoOperacion) {
  const t = tipoOperacion.toLowerCase();
  if (t.includes("dolar mep") || t.includes("dólar mep")) return null;
  if (t.includes("venta") || t.includes("rescate")) return "sell";
  if (t.includes("compra") || t.includes("suscripcion")) return "buy";
  return null;
}
function extractTickerFromInstrumento(instrumento) {
  let raw = instrumento.trim();
  if (raw.includes("(") && raw.includes(")")) {
    raw = raw.slice(raw.lastIndexOf("(") + 1, raw.lastIndexOf(")"));
  }
  return raw.toUpperCase();
}
function findColIndices(headers, fields) {
  const col = {};
  headers.forEach((h, i) => {
    for (const [key, needle] of Object.entries(fields)) {
      if (!(key in col) && h.includes(needle)) col[key] = i;
    }
  });
  return col;
}
function parseCocosAccountStatement(rows) {
  if (!rows.length) return [];
  const headers = headersLower(rows[0]);
  const col = findColIndices(headers, {
    fecha: "fecha",
    tipooperacion: "tipooperacion",
    instrumento: "instrumento",
    cantidad: "cantidad",
    precio: "precio"
  });
  const required = ["fecha", "tipooperacion", "instrumento", "cantidad", "precio"];
  if (!required.every(k => k in col)) return [];
  const items = [];
  for (const row of rows.slice(1)) {
    if (row.length <= Math.max(...Object.values(col))) continue;
    const txType = cocosAccountStatementTxType(row[col.tipooperacion]);
    if (!txType) continue;
    const date = parseDate(row[col.fecha]);
    if (!date) continue;
    const ticker = extractTickerFromInstrumento(row[col.instrumento]);
    if (!ticker) continue;
    let quantity = parseAmount(row[col.cantidad]);
    if (quantity === null || quantity === 0) continue;
    quantity = Math.abs(quantity);
    const price = parseAmount(row[col.precio]);
    if (price === null || price <= 0) continue;
    items.push({
      date,
      tx_type: txType,
      ticker,
      quantity,
      price,
      broker: "cocos_capital",
      csv_reference: `cocos_${date}_${ticker}_${quantity}`
    });
  }
  return items;
}
function parseCocosSimple(rows) {
  if (!rows.length) return [];
  const headers = headersLower(rows[0]);
  const col = findColIndices(headers, {
    fecha: "fecha",
    tipo: "tipo",
    especie: "especie",
    cantidad: "cantidad",
    precio: "precio"
  });
  const required = ["fecha", "tipo", "especie", "cantidad", "precio"];
  if (!required.every(k => k in col)) return [];
  const items = [];
  for (const row of rows.slice(1)) {
    if (row.length <= Math.max(...Object.values(col))) continue;
    const date = parseDate(row[col.fecha]);
    if (!date) continue;
    const txType = row[col.tipo].toLowerCase().includes("venta") ? "sell" : "buy";
    const ticker = row[col.especie].trim().toUpperCase();
    if (!ticker) continue;
    const quantity = parseAmount(row[col.cantidad]);
    if (quantity === null || quantity <= 0) continue;
    const price = parseAmount(row[col.precio]);
    if (price === null || price <= 0) continue;
    items.push({
      date,
      tx_type: txType,
      ticker,
      quantity,
      price,
      broker: "cocos_capital",
      csv_reference: `cocos_${date}_${ticker}_${quantity}`
    });
  }
  return items;
}
export function parseCocosCsv(csvBytes) {
  const text = readText(csvBytes);
  if (!text) return [];
  const rows = csvToRows(text, detectDelimiter(text));
  if (!rows.length) return [];
  const headers = headersLower(rows[0]);
  return isCocosAccountStatement(headers) ? parseCocosAccountStatement(rows) : parseCocosSimple(rows);
}
export function parseInvertirOnlineCsv(csvBytes) {
  const text = readText(csvBytes);
  if (!text) return [];
  const rows = csvToRows(text, detectDelimiter(text));
  if (!rows.length) return [];
  const headers = headersLower(rows[0]);
  const col = findColIndices(headers, {
    fecha: "fecha",
    isin: "isin",
    especie: "especie",
    cantidad: "cantidad",
    precio: "precio"
  });
  const required = ["fecha", "especie", "cantidad", "precio"];
  if (!required.every(k => k in col)) return [];
  const items = [];
  for (const row of rows.slice(1)) {
    if (row.length <= Math.max(...Object.values(col))) continue;
    const date = parseDate(row[col.fecha]);
    if (!date) continue;
    const ticker = row[col.especie].trim().toUpperCase();
    if (!ticker) continue;
    const quantity = parseAmount(row[col.cantidad]);
    if (quantity === null || quantity <= 0) continue;
    const price = parseAmount(row[col.precio]);
    if (price === null || price <= 0) continue;
    const isin = "isin" in col ? row[col.isin].trim() : "";
    const csvReference = isin ? `io_${isin}_${date}_${ticker}` : `io_${date}_${ticker}`;
    items.push({
      date,
      tx_type: "buy",
      ticker,
      quantity,
      price,
      broker: "invertir_online",
      csv_reference: csvReference
    });
  }
  return items;
}
export function parseBullMarketCsv(csvBytes) {
  const text = readText(csvBytes);
  if (!text) return [];
  const rows = csvToRows(text, detectDelimiter(text));
  if (!rows.length) return [];
  const headers = headersLower(rows[0]);
  const col = findColIndices(headers, {
    fecha: "fecha",
    simbolo: "simbolo",
    instrumento: "instrumento",
    tipooperacion: "tipooperacion",
    cantidad: "cantidad",
    precio: "precio"
  });
  const hasFecha = "fecha" in col;
  const hasTicker = "simbolo" in col || "instrumento" in col;
  const hasQty = "cantidad" in col;
  const hasPrice = "precio" in col;
  if (!(hasFecha && hasTicker && hasQty && hasPrice)) return [];
  const items = [];
  for (const row of rows.slice(1)) {
    if (row.length <= Math.max(...Object.values(col))) continue;
    const date = parseDate(row[col.fecha]);
    if (!date) continue;
    let tickerRaw = "";
    if ("simbolo" in col) tickerRaw = row[col.simbolo].trim();else if ("instrumento" in col) {
      tickerRaw = row[col.instrumento].trim();
      if (tickerRaw.includes("(") && tickerRaw.includes(")")) {
        tickerRaw = tickerRaw.slice(tickerRaw.lastIndexOf("(") + 1, tickerRaw.lastIndexOf(")"));
      }
    }
    const ticker = tickerRaw.toUpperCase();
    if (!ticker) continue;
    let quantity = parseAmount(row[col.cantidad]);
    if (quantity === null || quantity === 0) continue;
    const price = parseAmount(row[col.precio]);
    if (price === null || price <= 0) continue;
    let txType = "buy";
    if ("tipooperacion" in col) {
      const raw = row[col.tipooperacion].trim().toLowerCase();
      if (raw.includes("venta")) {
        txType = "sell";
        quantity = Math.abs(quantity);
      } else if (raw.includes("compra")) {
        txType = "buy";
        quantity = Math.abs(quantity);
      }
    }
    items.push({
      date,
      tx_type: txType,
      ticker,
      quantity,
      price,
      broker: "bull_market",
      csv_reference: `bull_${date}_${ticker}_${quantity}`
    });
  }
  return items;
}
export function parseCsv(csvBytes) {
  const broker = detectBroker(csvBytes);
  if (broker === "cocos_capital") return [broker, parseCocosCsv(csvBytes)];
  if (broker === "invertir_online") return [broker, parseInvertirOnlineCsv(csvBytes)];
  if (broker === "bull_market") return [broker, parseBullMarketCsv(csvBytes)];
  return [null, []];
}

// ─── PPI (Excel multi-hoja) ────────────────────────────────────────────────

function isPpiLedgerSheet(headers) {
  return headers.includes("fecha") && headers.includes("cantidad") && headers.includes("precio") && headers.includes("importe") && headers.includes("saldo");
}
function excelSerialToDate(serial) {
  // Excel epoch: 1899-12-30
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
function cellToDateStr(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return parseDate(val);
  if (typeof val === "number") return excelSerialToDate(val);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return null;
}
function cellToAmount(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  return parseAmount(String(val));
}
function parsePpiLedgerRows(rows) {
  if (!rows.length) return [];
  const headers = headersLower(rows[0].map(h => h !== null && h !== undefined ? String(h) : ""));
  const col = findColIndices(headers, {
    fecha: "fecha",
    descripcion: "descrip",
    cantidad: "cantidad",
    precio: "precio"
  });
  const required = ["fecha", "descripcion", "cantidad", "precio"];
  if (!required.every(k => k in col)) return [];
  const items = [];
  for (const row of rows.slice(1)) {
    if (row.length <= Math.max(...Object.values(col))) continue;
    const descripcion = String(row[col.descripcion] ?? "").trim();
    const lower = descripcion.toLowerCase();
    let txType;
    let ticker;
    if (lower.startsWith("compra ")) {
      txType = "buy";
      ticker = descripcion.slice(7).trim().toUpperCase();
    } else if (lower.startsWith("venta ")) {
      txType = "sell";
      ticker = descripcion.slice(6).trim().toUpperCase();
    } else {
      continue;
    }
    if (!ticker) continue;
    const date = cellToDateStr(row[col.fecha]);
    if (!date) continue;
    let quantity = cellToAmount(row[col.cantidad]);
    if (quantity === null || quantity === 0) continue;
    quantity = Math.abs(quantity);
    const price = cellToAmount(row[col.precio]);
    if (price === null || price <= 0) continue;
    items.push({
      date,
      tx_type: txType,
      ticker,
      quantity,
      price,
      broker: "ppi",
      csv_reference: `ppi_${date}_${ticker}_${quantity}`
    });
  }
  return items;
}
export function parseXlsx(xlsxBytes) {
  try {
    const wb = XLSX.read(xlsxBytes, {
      type: "buffer",
      cellDates: true
    });

    // Single-sheet brokers first (active sheet)
    const activeSheetName = wb.SheetNames[0];
    const activeSheet = wb.Sheets[activeSheetName];
    const rows = XLSX.utils.sheet_to_json(activeSheet, {
      header: 1,
      raw: true,
      defval: ""
    });
    const stringRows = rows.map(r => r.map(c => c === null || c === undefined ? "" : String(c)));
    if (stringRows.length) {
      const headers = headersLower(stringRows[0]);
      let broker = null;
      if (isCocosAccountStatement(headers)) broker = "cocos_capital";else if (headers.includes("especie") && headers.includes("comision")) broker = "cocos_capital";else if (headers.includes("isin") && headers.includes("liquidacion")) broker = "invertir_online";else if (headers.includes("simbolo")) broker = "bull_market";
      if (broker === "cocos_capital" && isCocosAccountStatement(headers)) {
        return [broker, parseCocosAccountStatement(stringRows)];
      }
      if (broker === "cocos_capital") return [broker, parseCocosSimple(stringRows)];
      if (broker === "invertir_online") return [broker, parseInvertirOnlineCsv(rowsToCsvBuffer(stringRows))];
      if (broker === "bull_market") return [broker, parseBullMarketCsv(rowsToCsvBuffer(stringRows))];
    }

    // PPI: multi-sheet ledger (one currency per sheet)
    const items = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: null
      });
      if (!sheetRows.length) continue;
      const headers = headersLower(sheetRows[0].map(h => h !== null && h !== undefined ? String(h) : ""));
      if (isPpiLedgerSheet(headers)) items.push(...parsePpiLedgerRows(sheetRows));
    }
    if (items.length) return ["ppi", items];
    return [null, []];
  } catch {
    return [null, []];
  }
}
function rowsToCsvBuffer(rows) {
  const text = rows.map(r => r.map(c => c.replace(/,/g, "")).join(",")).join("\n");
  return Buffer.from(text, "utf8");
}
export function parseFile(fileBytes, filename) {
  const nameLower = (filename || "").toLowerCase();
  if (nameLower.endsWith(".xlsx")) return parseXlsx(fileBytes);
  if (nameLower.endsWith(".csv")) return parseCsv(fileBytes);
  return [null, []];
}
