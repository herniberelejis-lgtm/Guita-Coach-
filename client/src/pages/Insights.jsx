import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api/client";
import { money, pct } from "../utils/format";
import { PageSpinner } from "../components/ui/Spinner";
import { ProgressBar } from "../components/ui/ProgressBar";
import { EmptyState } from "../components/ui/EmptyState";
const COLORS = ["#3d7d68", "#5a9b85", "#84b8a5", "#b0d3c5", "#2f6353", "#274f44", "#89939d", "#555e68"];
export function Insights() {
  const {
    data: monthData,
    isLoading
  } = useQuery({
    queryKey: ["insights", "month"],
    queryFn: () => api.get("/insights/month")
  });
  const {
    data: categories
  } = useQuery({
    queryKey: ["insights", "categories"],
    queryFn: () => api.get("/insights/categories")
  });
  const {
    data: methods
  } = useQuery({
    queryKey: ["insights", "payment-methods"],
    queryFn: () => api.get("/insights/payment-methods")
  });
  if (isLoading || !monthData) return <PageSpinner />;
  if (monthData.error) {
    return <EmptyState title={monthData.error} description="Configurá tu ingreso mensual en Configuración." />;
  }
  return <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink-900">Insights</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-ink-400">Gastado este mes</div>
          <div className="text-xl font-semibold text-ink-900">{money(monthData.total_spent)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-ink-400">Asignación diaria</div>
          <div className="text-xl font-semibold text-ink-900">{money(monthData.daily_allowance)}</div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-ink-400">Días hasta el cobro</div>
          <div className="text-xl font-semibold text-ink-900">{monthData.days_to_payday}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-ink-900">Proyección por franja</h2>
        <div className="flex flex-col gap-5">
          {monthData.franjas.map(f => <div key={f.category}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
                <span className="text-sm font-medium capitalize text-ink-800">{f.category}</span>
                <span className={`text-sm ${f.will_exceed ? "text-red-600" : "text-ink-500"}`}>
                  Proyectado: {money(f.projected_total)} / {money(f.limit)}
                </span>
              </div>
              <ProgressBar pct={f.usage_pct} />
              {f.top_merchants.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
                  {f.top_merchants.map(m => <span key={m.merchant} className="badge bg-ink-100 text-ink-600">
                      {m.merchant}: {money(m.amount)}
                    </span>)}
                </div>}
            </div>)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {categories && categories.categories.length > 0 && <div className="card">
            <h2 className="mb-4 text-base font-semibold text-ink-900">Gasto por categoría</h2>
            <div className="flex items-center gap-6">
              <div className="h-48 w-48 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categories.categories} dataKey="amount" nameKey="name" innerRadius={45} outerRadius={80}>
                      {categories.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 text-sm">
                {categories.categories.slice(0, 6).map((c, i) => <div key={c.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate text-ink-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{
                  background: COLORS[i % COLORS.length]
                }} />
                      {c.name}
                    </span>
                    <span className="whitespace-nowrap font-medium text-ink-800">{pct(c.pct)}</span>
                  </div>)}
              </div>
            </div>
          </div>}

        {methods && methods.methods.length > 0 && <div className="card">
            <h2 className="mb-4 text-base font-semibold text-ink-900">Medios de pago</h2>
            <div className="flex flex-col gap-3">
              {methods.methods.map(m => <div key={m.method}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-ink-700">{m.label}</span>
                    <span className="text-ink-500">
                      {money(m.amount)} ({pct(m.pct)})
                    </span>
                  </div>
                  <ProgressBar pct={m.pct} colorClass="bg-ink-500" />
                </div>)}
            </div>
          </div>}
      </div>

      {monthData.frequent_merchants.length > 0 && <div className="card">
          <h2 className="mb-4 text-base font-semibold text-ink-900">Comercios frecuentes</h2>
          <div className="flex flex-col divide-y divide-ink-50">
            {monthData.frequent_merchants.map(m => <div key={m.merchant} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-700">{m.merchant}</span>
                <span className="text-ink-500">
                  {m.count}x · {money(m.total)}
                </span>
              </div>)}
          </div>
        </div>}
    </div>;
}
