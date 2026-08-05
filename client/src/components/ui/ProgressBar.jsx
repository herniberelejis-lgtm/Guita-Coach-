import clsx from "clsx";
export function ProgressBar({
  pct,
  colorClass,
  trackClass,
  size = "md"
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = colorClass ?? (pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-brand-500");
  return <div className={clsx("w-full overflow-hidden rounded-full bg-ink-100", size === "sm" ? "h-1.5" : "h-2.5", trackClass)}>
      <div className={clsx("h-full rounded-full transition-all", color)} style={{
      width: `${clamped}%`
    }} />
    </div>;
}
