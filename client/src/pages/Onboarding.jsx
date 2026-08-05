import { useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
export function Onboarding() {
  const {
    user,
    refresh
  } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [income, setIncome] = useState("");
  const [payday, setPayday] = useState(1);
  const [variable, setVariable] = useState(false);
  const [necesidades, setNecesidades] = useState(50);
  const [gustos, setGustos] = useState(30);
  const [ahorro, setAhorro] = useState(20);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const total = necesidades + gustos + ahorro;
  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (total !== 100) {
      setError("Los porcentajes deben sumar 100");
      return;
    }
    setLoading(true);
    try {
      await api.post("/budget/onboarding", {
        name,
        monthly_income: Number(income) || 0,
        necesidades_pct: necesidades,
        gustos_pct: gustos,
        ahorro_pct: ahorro,
        payday,
        income_is_variable: variable
      });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "No pudimos guardar tu configuración");
    } finally {
      setLoading(false);
    }
  }
  return <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-lg card">
        <h1 className="text-xl font-semibold text-ink-900">Contanos de tus finanzas</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">
          Con esto armamos tu presupuesto en tres franjas: necesidades, gustos y ahorro.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div>
            <label className="label">¿Cómo te llamamos?</label>
            <input className="input" required value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="label">Ingreso mensual (ARS)</label>
            <input className="input" type="number" min={0} required value={income} onChange={e => setIncome(e.target.value)} placeholder="0" />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={variable} onChange={e => setVariable(e.target.checked)} className="h-4 w-4 rounded border-ink-300" />
            Mis ingresos son variables (freelance, comisiones, etc.)
          </label>

          <div>
            <label className="label">Día de cobro</label>
            <input className="input" type="number" min={1} max={28} value={payday} onChange={e => setPayday(Number(e.target.value))} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Necesidades %</label>
              <input className="input" type="number" min={0} max={100} value={necesidades} onChange={e => setNecesidades(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Gustos %</label>
              <input className="input" type="number" min={0} max={100} value={gustos} onChange={e => setGustos(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Ahorro %</label>
              <input className="input" type="number" min={0} max={100} value={ahorro} onChange={e => setAhorro(Number(e.target.value))} />
            </div>
          </div>
          <p className={`text-xs ${total === 100 ? "text-ink-400" : "text-red-600"}`}>Total: {total}% (debe ser 100%)</p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
            Empezar
          </button>
        </form>
      </div>
    </div>;
}
