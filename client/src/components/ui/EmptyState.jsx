export function EmptyState({
  icon,
  title,
  description,
  action
}) {
  return <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="text-4xl text-ink-300">{icon}</div>}
      <div className="text-base font-semibold text-ink-800">{title}</div>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
      {action}
    </div>;
}
