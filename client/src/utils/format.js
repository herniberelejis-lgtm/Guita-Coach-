export function money(value, currency = "ARS") {
  const v = value ?? 0;
  const symbol = currency === "USD" ? "US$" : "$";
  return `${symbol}${Math.round(v).toLocaleString("es-AR")}`;
}
export function pct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
export function shortDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y.slice(2)}`;
}
export function monthLabel(month) {
  const [y, m] = month.split("-");
  const names = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const idx = Number(m) - 1;
  return `${names[idx] ?? m} ${y}`;
}
