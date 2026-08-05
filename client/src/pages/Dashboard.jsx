import { useQuery } from "@tanstack/react-query";
import { LuTriangleAlert, LuWallet, LuTrendingUp, LuTrendingDown, LuSparkles } from "react-icons/lu";
import { api } from "../api/client";
import { money, pct, monthLabel } from "../utils/format";
import { ProgressBar } from "../components/ui/ProgressBar";
import { PageSpinner } from "../components/ui/Spinner";
export function Dashboard() {
  const {
    data: budget,
    isLoading
  } = useQuery({
    queryKey: ["budget", "current"],
    queryFn: () => api.get("/budget/current")
  });
  const {
    data: dolar
  } = useQuery({
    queryKey: ["insights", "dolar"],
    queryFn: () => api.get("/insights/dolar")
  });
  if (isLoading || !budget) return <PageSpinner />;
  const balancePositive = budget.total_income - budget.total_expenses >= 0;
  return <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Hola, {budget.name} 👋</h1>
          <p className="text-sm text-ink-500 capitalize">{monthLabel(budget.month)}</p>
        </div>
        {dolar?.blue?.venta && <div className="card px-4 py-2 text-right">
            <div className="text-xs text-ink-400">Dólar blue</div>
            <div className="text-sm font-semibold text-ink-800">{money(dolar.blue.venta)}</div>
          </div>}
      </div>

      {budget.alerts.length > 0 && <div className="flex flex-col gap-2">
          {budget.alerts.slice(0, 3).map(a => <div key={a.id} className="card flex items-start gap-3 border-amber-200 bg-amber-50/60 py-3">
              <LuTriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-ink-800">{a.message}</p>
                {a.ai_advice && <p className="mt-1 text-sm text-ink-500">{a.ai_advice}</p>}
              </div>
            </div>)}
        </div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ingresos del mes" value={money(budget.total_income)} icon={<LuTrendingUp className="h-5 w-5 text-brand-600" />} />
        <StatCard label="Gastos del mes" value={money(budget.total_expenses)} icon={<LuTrendingDown className="h-5 w-5 text-red-500" />} />
        <StatCard label="Balance" value={money(budget.total_income - budget.total_expenses)} valueClass={balancePositive ? "text-brand-700" : "text-red-600"} icon={<LuWallet className="h-5 w-5 text-ink-600" />} />
        <StatCard label="Días restantes" value={String(budget.days_remaining)} icon={<LuSparkles className="h-5 w-5 text-ink-600" />} />
      </div>

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-ink-900">Tus franjas de presupuesto</h2>
        <div className="flex flex-col gap-5">
          {budget.franjas.map(f => <div key={f.name}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink-800">{f.label}</span>
                <span className="text-sm text-ink-500">
                  {money(f.spent)} / {money(f.limit)} ({pct(f.usage_pct)})
                </span>
              </div>
              <ProgressBar pct={f.usage_pct} />
              <div className="mt-1 text-xs text-ink-400">Podés gastar {money(f.daily_allowance)} por día</div>
            </div>)}
        </div>
      </div>

      {budget.pending_count > 0 && <div className="card border-brand-100 bg-brand-50/50">
          <p className="text-sm text-ink-700">
            Tenés <span className="font-semibold">{budget.pending_count}</span> transacciones pendientes de revisar en la
            sección de Transacciones.
          </p>
        </div>}
    </div>;
}
function StatCard({
  label,
  value,
  icon,
  valueClass
}) {
  return <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</span>
        {icon}
      </div>
      <div className={`text-xl font-semibold ${valueClass ?? "text-ink-900"}`}>{value}</div>
    </div>;
}
