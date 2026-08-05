import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuPlus, LuRefreshCw, LuTrendingDown, LuTrendingUp, LuUpload, LuX } from "react-icons/lu";
import { api, ApiError } from "../api/client";
import { money, pct, shortDate } from "../utils/format";
import { PageSpinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
export function Investments() {
  const queryClient = useQueryClient();
  const fileInput = useRef(null);
  const [showManual, setShowManual] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const {
    data: summary,
    isLoading: loadingSummary
  } = useQuery({
    queryKey: ["investments", "summary"],
    queryFn: () => api.get("/investments/summary")
  });
  const {
    data: holdings,
    isLoading: loadingHoldings
  } = useQuery({
    queryKey: ["investments", "holdings"],
    queryFn: () => api.get("/investments/holdings")
  });
  const {
    data: history
  } = useQuery({
    queryKey: ["investments", "history"],
    queryFn: () => api.get("/investments/history")
  });
  const upload = useMutation({
    mutationFn: file => api.upload("/investments/upload", file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["investments"]
      });
      setUploadError(null);
    },
    onError: e => setUploadError(e instanceof ApiError ? e.detail : "No pudimos procesar el archivo")
  });
  const refreshPrices = useMutation({
    mutationFn: () => api.post("/investments/refresh-prices"),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["investments"]
    })
  });
  const isLoading = loadingSummary || loadingHoldings;
  return <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">Inversiones</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => refreshPrices.mutate()} disabled={refreshPrices.isPending}>
            <LuRefreshCw className={`h-4 w-4 ${refreshPrices.isPending ? "animate-spin" : ""}`} />
            Actualizar precios
          </button>
          <button className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
            <LuUpload className="h-4 w-4" />
            Importar CSV/XLSX
          </button>
          <input ref={fileInput} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }} />
          <button className="btn-primary" onClick={() => setShowManual(true)}>
            <LuPlus className="h-4 w-4" />
            Registrar operación
          </button>
        </div>
      </div>

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      {isLoading ? <PageSpinner /> : <>
          {summary && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Valor actual" value={money(summary.total_current_value)} />
              <SummaryCard label="Invertido" value={money(summary.total_invested)} />
              <SummaryCard label="No realizado" value={money(summary.total_unrealized)} positive={summary.total_unrealized >= 0} />
              <SummaryCard label="Ganancia/pérdida total" value={money(summary.total_pnl)} positive={summary.total_pnl >= 0} />
            </div>}

          {summary?.blue_rate && <p className="text-xs text-ink-400">Dólar blue usado para conversión: {money(summary.blue_rate)}</p>}

          {summary?.risk_flags && summary.risk_flags.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Concentración alta en: {summary.risk_flags.map(f => `${f.ticker} (${pct(f.pct)})`).join(", ")}
            </div>}

          <div className="card overflow-x-auto">
            <h2 className="mb-4 text-base font-semibold text-ink-900">Posiciones abiertas</h2>
            {!holdings?.length ? <EmptyState title="Sin posiciones abiertas" description="Importá tus operaciones o registrá una manualmente." /> : <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="py-2 pr-3">Ticker</th>
                    <th className="py-2 pr-3">Broker</th>
                    <th className="py-2 pr-3 text-right">Cantidad</th>
                    <th className="py-2 pr-3 text-right">Costo prom.</th>
                    <th className="py-2 pr-3 text-right">Precio actual</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {holdings.map(h => <tr key={`${h.ticker}-${h.broker}`}>
                      <td className="py-2.5 pr-3 font-medium text-ink-900">
                        {h.ticker}
                        {!h.priced && <span className="ml-1 text-xs text-ink-400">(sin precio)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-ink-500">{h.broker}</td>
                      <td className="py-2.5 pr-3 text-right text-ink-700">{h.quantity}</td>
                      <td className="py-2.5 pr-3 text-right text-ink-700">{money(h.avg_cost, h.currency)}</td>
                      <td className="py-2.5 pr-3 text-right text-ink-700">{money(h.current_price, h.currency)}</td>
                      <td className="py-2.5 pr-3 text-right font-medium text-ink-900">{money(h.current_value, h.currency)}</td>
                      <td className={`flex items-center justify-end gap-1 py-2.5 text-right font-medium ${h.pnl >= 0 ? "text-brand-600" : "text-red-600"}`}>
                        {h.pnl >= 0 ? <LuTrendingUp className="h-3.5 w-3.5" /> : <LuTrendingDown className="h-3.5 w-3.5" />}
                        {money(h.pnl, h.currency)} ({pct(h.pnl_percent)})
                      </td>
                    </tr>)}
                </tbody>
              </table>}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="mb-4 text-base font-semibold text-ink-900">Historial de operaciones</h2>
            {!history?.length ? <p className="text-sm text-ink-400">Sin operaciones registradas.</p> : <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Ticker</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3 text-right">Cantidad</th>
                    <th className="py-2 pr-3 text-right">Precio</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {history.slice(0, 30).map((h, i) => <tr key={i}>
                      <td className="py-2 pr-3 text-ink-500">{shortDate(h.date)}</td>
                      <td className="py-2 pr-3 font-medium text-ink-800">{h.ticker}</td>
                      <td className="py-2 pr-3">
                        <span className={`badge ${h.type === "buy" ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700"}`}>
                          {h.type === "buy" ? "Compra" : "Venta"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-ink-700">{h.quantity}</td>
                      <td className="py-2 pr-3 text-right text-ink-700">{money(h.price)}</td>
                      <td className="py-2 text-right font-medium text-ink-900">{money(h.total)}</td>
                    </tr>)}
                </tbody>
              </table>}
          </div>
        </>}

      {showManual && <ManualTxModal onClose={() => setShowManual(false)} />}
    </div>;
}
function SummaryCard({
  label,
  value,
  positive
}) {
  return <div className="card">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`text-xl font-semibold ${positive === undefined ? "text-ink-900" : positive ? "text-brand-600" : "text-red-600"}`}>
        {value}
      </div>
    </div>;
}
function ManualTxModal({
  onClose
}) {
  const queryClient = useQueryClient();
  const [ticker, setTicker] = useState("");
  const [txType, setTxType] = useState("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("ARS");
  const [error, setError] = useState(null);
  const create = useMutation({
    mutationFn: () => api.post("/investments/manual", {
      ticker,
      tx_type: txType,
      quantity: Number(quantity),
      price: Number(price),
      date,
      currency
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["investments"]
      });
      onClose();
    },
    onError: e => setError(e instanceof ApiError ? e.detail : "No pudimos registrar la operación")
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Registrar operación</h2>
          <button onClick={onClose}>
            <LuX className="h-5 w-5 text-ink-400" />
          </button>
        </div>
        <form className="flex flex-col gap-3" onSubmit={e => {
        e.preventDefault();
        create.mutate();
      }}>
          <input className="input" placeholder="Ticker (ej: GGAL, AAPL, BTC)" required value={ticker} onChange={e => setTicker(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={txType} onChange={e => setTxType(e.target.value)}>
                <option value="buy">Compra</option>
                <option value="sell">Venta</option>
              </select>
            </div>
            <div>
              <label className="label">Moneda</label>
              <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" type="number" step="any" min={0} placeholder="Cantidad" required value={quantity} onChange={e => setQuantity(e.target.value)} />
            <input className="input" type="number" step="any" min={0} placeholder="Precio" required value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <input className="input" type="date" required value={date} onChange={e => setDate(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={create.isPending}>
            Guardar
          </button>
        </form>
      </div>
    </div>;
}
