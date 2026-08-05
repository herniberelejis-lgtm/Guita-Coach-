export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthList(n = 6) {
  const months = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  for (let i = 0; i < n; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}
