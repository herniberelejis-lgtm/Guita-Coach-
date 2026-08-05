import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LuBookOpen, LuChevronDown, LuChevronUp } from "react-icons/lu";
import { api } from "../api/client";
import { PageSpinner } from "../components/ui/Spinner";
export function Academy() {
  const [openTopic, setOpenTopic] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const {
    data,
    isLoading
  } = useQuery({
    queryKey: ["academy"],
    queryFn: () => api.get("/academy")
  });
  if (isLoading || !data) return <PageSpinner />;
  return <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink-900">Academia Guita Coach</h1>

      {data.recommended.length > 0 && <div className="card">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink-900">
            <LuBookOpen className="h-4 w-4 text-brand-600" />
            Recomendado para vos
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.recommended.map(t => <TopicCard key={t.id} topic={t} open={openTopic === t.id} onToggle={() => setOpenTopic(openTopic === t.id ? null : t.id)} />)}
          </div>
        </div>}

      {data.categories.map(cat => <div className="card" key={cat.category}>
          <h2 className="mb-3 text-base font-semibold text-ink-900">{cat.label}</h2>
          <div className="flex flex-col gap-2">
            {cat.topics.map(t => <TopicCard key={t.id} topic={t} open={openTopic === t.id} onToggle={() => setOpenTopic(openTopic === t.id ? null : t.id)} compact />)}
          </div>
        </div>)}

      {data.glossary.length > 0 && <div className="card">
          <button className="flex w-full items-center justify-between text-base font-semibold text-ink-900" onClick={() => setShowGlossary(v => !v)}>
            Glosario financiero
            {showGlossary ? <LuChevronUp className="h-4 w-4" /> : <LuChevronDown className="h-4 w-4" />}
          </button>
          {showGlossary && <div className="mt-4 flex flex-col divide-y divide-ink-50">
              {data.glossary.map(g => <div key={g.term} className="py-3">
                  <div className="font-medium text-ink-900">{g.term}</div>
                  <div className="text-sm text-ink-500">{g.definition_simple}</div>
                  {g.example && <div className="mt-1 text-xs italic text-ink-400">Ej: {g.example}</div>}
                </div>)}
            </div>}
        </div>}
    </div>;
}
function TopicCard({
  topic,
  open,
  onToggle,
  compact
}) {
  return <div className={`rounded-xl border border-ink-100 ${compact ? "p-3" : "p-4"}`}>
      <button className="flex w-full items-start justify-between gap-2 text-left" onClick={onToggle}>
        <div>
          <div className="font-medium text-ink-900">{topic.title}</div>
          <div className="mt-0.5 text-sm text-ink-500">{topic.summary}</div>
        </div>
        {open ? <LuChevronUp className="mt-1 h-4 w-4 flex-shrink-0 text-ink-400" /> : <LuChevronDown className="mt-1 h-4 w-4 flex-shrink-0 text-ink-400" />}
      </button>
      {open && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{topic.body}</p>}
    </div>;
}
