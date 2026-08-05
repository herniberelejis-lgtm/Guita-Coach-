import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuPlus, LuRefreshCw, LuUpload, LuX } from "react-icons/lu";
import { api, ApiError } from "../api/client";
import { money, shortDate } from "../utils/format";
import { PageSpinner } from "../components/ui/Spinner";
import { EmptyState } from "../components/ui/EmptyState";
const CATEGORIES = [{
  value: "necesidades",
  label: "Necesidades"
}, {
  value: "gustos",
  label: "Gustos"
}, {
  value: "ahorro",
  label: "Ahorro"
}];
export function Transactions() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const {
    data,
    isLoading
  } = useQuery({
    queryKey: ["transactions", {
      category,
      search
    }],
    queryFn: () => api.get(`/transactions?${new URLSearchParams({
      ...(category ? {
        category
      } : {}),
      ...(search ? {
        search
      } : {}),
      limit: "100"
    })}`)
  });
  const syncMp = useMutation({
    mutationFn: () => api.post("/sync/mp"),
    onSuccess: r => {
      setSyncMsg(`Mercado Pago: ${r.saved} nuevas de ${r.fetched} encontradas.`);
      queryClient.invalidateQueries({
        queryKey: ["transactions"]
      });
      queryClient.invalidateQueries({
        queryKey: ["budget"]
      });
    },
    onError: e => setSyncMsg(e instanceof ApiError ? e.detail : "Error al sincronizar Mercado Pago")
  });
  const syncGmail = useMutation({
    mutationFn: () => api.post("/sync/gmail"),
    onSuccess: r => {
      setSyncMsg(`Gmail: ${r.saved} nuevas de ${r.fetched} encontradas.`);
      queryClient.invalidateQueries({
        queryKey: ["transactions"]
      });
      queryClient.invalidateQueries({
        queryKey: ["budget"]
      });
    },
    onError: e => setSyncMsg(e instanceof ApiError ? e.detail : "Error al sincronizar Gmail")
  });
  const deleteTx = useMutation({
    mutationFn: id => api.delete(`/transactions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["transactions"]
    })
  });
  return <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">Transacciones</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => syncMp.mutate()} disabled={syncMp.isPending}>
            <LuRefreshCw className={`h-4 w-4 ${syncMp.isPending ? "animate-spin" : ""}`} />
            Mercado Pago
          </button>
          <button className="btn-secondary" onClick={() => syncGmail.mutate()} disabled={syncGmail.isPending}>
            <LuRefreshCw className={`h-4 w-4 ${syncGmail.isPending ? "animate-spin" : ""}`} />
            Gmail
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <LuPlus className="h-4 w-4" />
            Agregar
          </button>
        </div>
      </div>

      {syncMsg && <div className="card flex items-center justify-between bg-brand-50/60 py-2.5 text-sm text-ink-700">
          {syncMsg}
          <button onClick={() => setSyncMsg(null)}>
            <LuX className="h-4 w-4 text-ink-400" />
          </button>
        </div>}

      <div className="flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Buscar comercio..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input max-w-[200px]" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>
              {c.label}
            </option>)}
        </select>
      </div>

      {isLoading ? <PageSpinner /> : !data?.items.length ? <EmptyState title="No hay transacciones" description="Sincronizá tus cuentas o agregá una manualmente." /> : <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Comercio</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map(t => <TxRow key={t.id} tx={t} onDelete={() => deleteTx.mutate(t.id)} />)}
            </tbody>
          </table>
        </div>}

      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} onCreated={() => {
      setShowAdd(false);
      queryClient.invalidateQueries({
        queryKey: ["transactions"]
      });
      queryClient.invalidateQueries({
        queryKey: ["budget"]
      });
    }} />}
    </div>;
}
function TxRow({
  tx,
  onDelete
}) {
  const isIncome = tx.tx_type === "income";
  return <tr className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
      <td className="whitespace-nowrap px-4 py-3 text-ink-500">{shortDate(tx.date)}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-ink-800">{tx.merchant || "—"}</div>
        {tx.needs_review && <span className="badge bg-amber-100 text-amber-700">A revisar</span>}
      </td>
      <td className="px-4 py-3 text-ink-500">{tx.subcategory || tx.category || "—"}</td>
      <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${isIncome ? "text-brand-700" : "text-ink-800"}`}>
        {isIncome ? "+" : "-"}
        {money(tx.amount)}
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={onDelete} className="text-xs text-ink-400 hover:text-red-600">
          Eliminar
        </button>
      </td>
    </tr>;
}
function AddTransactionModal({
  onClose,
  onCreated
}) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [txType, setTxType] = useState("expense");
  const [category, setCategory] = useState("");
  const [error, setError] = useState(null);
  const create = useMutation({
    mutationFn: () => api.post("/transactions", {
      merchant,
      amount: Number(amount),
      date,
      tx_type: txType,
      category
    }),
    onSuccess: onCreated,
    onError: e => setError(e instanceof ApiError ? e.detail : "No pudimos guardar la transacción")
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Nueva transacción</h2>
          <button onClick={onClose}>
            <LuX className="h-5 w-5 text-ink-400" />
          </button>
        </div>
        <form className="flex flex-col gap-3" onSubmit={e => {
        e.preventDefault();
        create.mutate();
      }}>
          <select className="input" value={txType} onChange={e => setTxType(e.target.value)}>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
          <input className="input" placeholder="Comercio" required value={merchant} onChange={e => setMerchant(e.target.value)} />
          <input className="input" type="number" placeholder="Monto" required min={0.01} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          <input className="input" type="date" required value={date} onChange={e => setDate(e.target.value)} />
          {txType === "expense" && <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Clasificar automáticamente</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>
                  {c.label}
                </option>)}
            </select>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary mt-2 w-full" type="submit" disabled={create.isPending}>
            <LuUpload className="h-4 w-4" />
            Guardar
          </button>
        </form>
      </div>
    </div>;
}
