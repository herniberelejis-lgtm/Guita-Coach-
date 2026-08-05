import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { api, ApiError } from "../api/client";
import { money, pct } from "../utils/format";
import { PageSpinner } from "../components/ui/Spinner";
import { ProgressBar } from "../components/ui/ProgressBar";
import { EmptyState } from "../components/ui/EmptyState";
export function Goals() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const {
    data: goals,
    isLoading
  } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api.get("/goals")
  });
  const {
    data: recurring
  } = useQuery({
    queryKey: ["goals", "recurring"],
    queryFn: () => api.get("/goals/recurring")
  });
  const deleteGoal = useMutation({
    mutationFn: id => api.delete(`/goals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["goals"]
    })
  });
  const deleteRecurring = useMutation({
    mutationFn: id => api.delete(`/goals/recurring/${id}`),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["goals", "recurring"]
    })
  });
  return <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">Metas y gastos fijos</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowRecurring(true)}>
            <LuPlus className="h-4 w-4" />
            Gasto fijo
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <LuPlus className="h-4 w-4" />
            Nueva meta
          </button>
        </div>
      </div>

      {isLoading ? <PageSpinner /> : !goals?.length ? <EmptyState title="Todavía no tenés metas" description="Creá tu primera meta de ahorro." /> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => deleteGoal.mutate(g.id)} />)}
        </div>}

      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-ink-900">Gastos fijos y cuotas</h2>
        {recurring && <p className="mb-3 text-sm text-ink-500">Comprometido por mes: {money(recurring.monthly_committed)}</p>}
        {!recurring?.items.length ? <p className="text-sm text-ink-400">No tenés gastos fijos configurados.</p> : <div className="flex flex-col divide-y divide-ink-50">
            {recurring.items.map(r => <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink-800">{r.merchant}</div>
                  <div className="text-xs text-ink-400">
                    Día {r.day_of_month}
                    {r.installments_total > 0 && ` · cuota ${r.installments_paid}/${r.installments_total}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-ink-700">{money(r.amount)}</span>
                  <button onClick={() => deleteRecurring.mutate(r.id)} className="text-ink-400 hover:text-red-600">
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>)}
          </div>}
      </div>

      {showAdd && <AddGoalModal onClose={() => setShowAdd(false)} onCreated={() => setShowAdd(false)} />}
      {showRecurring && <AddRecurringModal onClose={() => setShowRecurring(false)} onCreated={() => setShowRecurring(false)} />}
    </div>;
}
function GoalCard({
  goal,
  onDelete
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const contribute = useMutation({
    mutationFn: () => api.post(`/goals/${goal.id}/contribute`, {
      amount: Number(amount)
    }),
    onSuccess: () => {
      setAmount("");
      queryClient.invalidateQueries({
        queryKey: ["goals"]
      });
    }
  });
  return <div className="card">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-semibold text-ink-900">{goal.name}</h3>
        <button onClick={onDelete} className="text-ink-400 hover:text-red-600">
          <LuTrash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1.5 flex justify-between text-sm text-ink-500">
        <span>{money(goal.saved_amount, goal.currency)}</span>
        <span>{money(goal.target_amount, goal.currency)}</span>
      </div>
      <ProgressBar pct={goal.progress_pct} colorClass={goal.is_done ? "bg-brand-500" : undefined} />
      <div className="mt-1 text-right text-xs text-ink-400">{pct(goal.progress_pct)}</div>

      {!goal.is_done && <form className="mt-3 flex gap-2" onSubmit={e => {
      e.preventDefault();
      if (Number(amount) > 0) contribute.mutate();
    }}>
          <input className="input" type="number" min={1} placeholder="Aportar monto" value={amount} onChange={e => setAmount(e.target.value)} />
          <button className="btn-secondary" type="submit" disabled={contribute.isPending}>
            +
          </button>
        </form>}
    </div>;
}
function AddGoalModal({
  onClose,
  onCreated
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [error, setError] = useState(null);
  const create = useMutation({
    mutationFn: () => api.post("/goals", {
      name,
      target_amount: Number(targetAmount)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["goals"]
      });
      onCreated();
    },
    onError: e => setError(e instanceof ApiError ? e.detail : "No pudimos crear la meta")
  });
  return <Modal title="Nueva meta" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={e => {
      e.preventDefault();
      create.mutate();
    }}>
        <input className="input" placeholder="Nombre de la meta" required value={name} onChange={e => setName(e.target.value)} />
        <input className="input" type="number" placeholder="Monto objetivo" required min={1} value={targetAmount} onChange={e => setTargetAmount(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={create.isPending}>
          Crear meta
        </button>
      </form>
    </Modal>;
}
function AddRecurringModal({
  onClose,
  onCreated
}) {
  const queryClient = useQueryClient();
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [installments, setInstallments] = useState(0);
  const [error, setError] = useState(null);
  const create = useMutation({
    mutationFn: () => api.post("/goals/recurring", {
      merchant,
      amount: Number(amount),
      day_of_month: dayOfMonth,
      installments_total: installments
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["goals", "recurring"]
      });
      onCreated();
    },
    onError: e => setError(e instanceof ApiError ? e.detail : "No pudimos crear el gasto fijo")
  });
  return <Modal title="Nuevo gasto fijo" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={e => {
      e.preventDefault();
      create.mutate();
    }}>
        <input className="input" placeholder="Nombre (ej: Alquiler)" required value={merchant} onChange={e => setMerchant(e.target.value)} />
        <input className="input" type="number" placeholder="Monto mensual" required min={1} value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Día del mes</label>
            <input className="input" type="number" min={1} max={28} value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Cuotas (0 = sin límite)</label>
            <input className="input" type="number" min={0} value={installments} onChange={e => setInstallments(Number(e.target.value))} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" type="submit" disabled={create.isPending}>
          Crear
        </button>
      </form>
    </Modal>;
}
function Modal({
  title,
  onClose,
  children
}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose}>
            <LuX className="h-5 w-5 text-ink-400" />
          </button>
        </div>
        {children}
      </div>
    </div>;
}
