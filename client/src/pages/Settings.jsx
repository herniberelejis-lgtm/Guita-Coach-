import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuCheck, LuLink, LuLoaderCircle, LuLogOut, LuRefreshCw, LuUnlink } from "react-icons/lu";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { shortDate } from "../utils/format";
import { PageSpinner } from "../components/ui/Spinner";
export function Settings() {
  const {
    logout
  } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: budget,
    isLoading
  } = useQuery({
    queryKey: ["budget", "current"],
    queryFn: () => api.get("/budget/current")
  });
  const {
    data: connections
  } = useQuery({
    queryKey: ["sync", "status"],
    queryFn: () => api.get("/sync/status")
  });
  const [income, setIncome] = useState("");
  const [payday, setPayday] = useState(1);
  const [isVariable, setIsVariable] = useState(false);
  const [necesidades, setNecesidades] = useState(50);
  const [gustos, setGustos] = useState(30);
  const [ahorro, setAhorro] = useState(20);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!budget) return;
    setIncome(String(budget.declared_income || ""));
    setPayday(budget.payday);
    setIsVariable(budget.income_is_variable);
    const f = name => budget.franjas.find(x => x.name === name)?.pct_config;
    setNecesidades(f("necesidades") ?? 50);
    setGustos(f("gustos") ?? 30);
    setAhorro(f("ahorro") ?? 20);
  }, [budget]);
  const saveSettings = useMutation({
    mutationFn: () => api.patch("/budget/settings", {
      monthly_income: Number(income) || 0,
      payday,
      income_is_variable: isVariable,
      necesidades_pct: necesidades,
      gustos_pct: gustos,
      ahorro_pct: ahorro
    }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ["budget"]
      });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: e => setError(e instanceof ApiError ? e.detail : "No pudimos guardar la configuración")
  });
  const syncNow = useMutation({
    mutationFn: provider => api.post(`/sync/${provider}`),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["sync"]
    })
  });
  const disconnect = useMutation({
    mutationFn: provider => api.post(`/auth/disconnect/${provider}`),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["sync", "status"]
    })
  });
  const csvUpload = useMutation({
    mutationFn: file => api.upload("/sync/csv", file),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["transactions"]
    }),
    onError: e => setError(e instanceof ApiError ? e.detail : "No pudimos procesar el CSV")
  });
  const total = necesidades + gustos + ahorro;
  if (isLoading || !budget) return <PageSpinner />;
  return <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink-900">Configuración</h1>

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-ink-900">Presupuesto</h2>
        <form className="flex flex-col gap-4" onSubmit={e => {
        e.preventDefault();
        if (total !== 100) {
          setError("Los porcentajes deben sumar 100");
          return;
        }
        saveSettings.mutate();
      }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Ingreso mensual declarado</label>
              <input className="input" type="number" min={0} value={income} onChange={e => setIncome(e.target.value)} />
            </div>
            <div>
              <label className="label">Día de cobro</label>
              <input className="input" type="number" min={1} max={28} value={payday} onChange={e => setPayday(Number(e.target.value))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={isVariable} onChange={e => setIsVariable(e.target.checked)} />
            Mi ingreso es variable (usar lo que realmente entra cada mes)
          </label>

          <div>
            <label className="label">Distribución del presupuesto (necesidades / gustos / ahorro)</label>
            <div className="grid grid-cols-3 gap-3">
              <input className="input" type="number" min={0} max={100} value={necesidades} onChange={e => setNecesidades(Number(e.target.value))} />
              <input className="input" type="number" min={0} max={100} value={gustos} onChange={e => setGustos(Number(e.target.value))} />
              <input className="input" type="number" min={0} max={100} value={ahorro} onChange={e => setAhorro(Number(e.target.value))} />
            </div>
            <p className={`mt-1.5 text-xs ${total === 100 ? "text-ink-400" : "text-red-600"}`}>Total: {total}% (debe ser 100%)</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button className="btn-primary" type="submit" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : <LuCheck className="h-4 w-4" />}
              Guardar cambios
            </button>
            {saved && <span className="text-sm text-brand-600">Guardado.</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-ink-900">Conexiones</h2>
        <div className="flex flex-col divide-y divide-ink-50">
          <ConnectionRow label="Gmail" description="Detecta pagos automáticamente desde tus mails de notificaciones." status={connections?.gmail?.status} lastSync={connections?.gmail?.last_sync} connectHref="/api/auth/gmail" onSync={() => syncNow.mutate("gmail")} onDisconnect={() => disconnect.mutate("gmail")} syncing={syncNow.isPending && syncNow.variables === "gmail"} />
          <ConnectionRow label="Mercado Pago" description="Importa tus movimientos de Mercado Pago automáticamente." status={connections?.mercadopago?.status} lastSync={connections?.mercadopago?.last_sync} connectHref="/api/auth/mp" onSync={() => syncNow.mutate("mp")} onDisconnect={() => disconnect.mutate("mercadopago")} syncing={syncNow.isPending && syncNow.variables === "mp"} />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-base font-semibold text-ink-900">Importar CSV de Mercado Pago</h2>
        <p className="mb-3 text-sm text-ink-500">Subí el archivo de movimientos exportado desde Mercado Pago.</p>
        <input type="file" accept=".csv" className="text-sm" onChange={e => {
        const file = e.target.files?.[0];
        if (file) csvUpload.mutate(file);
        e.target.value = "";
      }} />
        {csvUpload.isPending && <p className="mt-2 text-sm text-ink-400">Procesando...</p>}
        {csvUpload.isSuccess && <p className="mt-2 text-sm text-brand-600">Importación completada.</p>}
      </div>

      <div className="card">
        <button className="btn-secondary" onClick={logout}>
          <LuLogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>;
}
function ConnectionRow({
  label,
  description,
  status,
  lastSync,
  connectHref,
  onSync,
  onDisconnect,
  syncing
}) {
  const connected = status === "connected";
  return <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <div className="flex items-center gap-2 font-medium text-ink-800">
          {label}
          <span className={`badge ${connected ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500"}`}>
            {connected ? "Conectado" : "Desconectado"}
          </span>
        </div>
        <p className="text-sm text-ink-400">{description}</p>
        {connected && lastSync && <p className="text-xs text-ink-400">Última sincronización: {shortDate(lastSync)}</p>}
      </div>
      <div className="flex gap-2">
        {connected ? <>
            <button className="btn-secondary" onClick={onSync} disabled={syncing}>
              <LuRefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar
            </button>
            <button className="btn-secondary" onClick={onDisconnect}>
              <LuUnlink className="h-4 w-4" />
              Desconectar
            </button>
          </> : <a className="btn-primary" href={connectHref}>
            <LuLink className="h-4 w-4" />
            Conectar
          </a>}
      </div>
    </div>;
}
