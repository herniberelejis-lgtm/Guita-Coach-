import clsx from "clsx";
export function Spinner({
  className
}) {
  return <div className={clsx("h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600", className)} role="status" aria-label="Cargando" />;
}
export function PageSpinner() {
  return <div className="flex h-full min-h-[240px] w-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>;
}
