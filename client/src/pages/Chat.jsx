import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LuSend, LuSparkles } from "react-icons/lu";
import { api } from "../api/client";
export function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const {
    data: startersData
  } = useQuery({
    queryKey: ["chat", "starters"],
    queryFn: () => api.get("/chat/starters")
  });
  const send = useMutation({
    mutationFn: message => api.post("/chat", {
      message,
      history: messages
    }),
    onSuccess: (data, message) => {
      setMessages(prev => [...prev, {
        role: "user",
        content: message
      }, {
        role: "assistant",
        content: data.reply
      }]);
    }
  });
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, send.isPending]);
  function submit(text) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    setInput("");
    send.mutate(trimmed);
  }
  return <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <h1 className="text-2xl font-semibold text-ink-900">Coach financiero</h1>

      <div className="card flex flex-1 flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto p-5">
          {messages.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <LuSparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-ink-800">Preguntame lo que necesites sobre tus finanzas</p>
                <p className="text-sm text-ink-400">Tengo en cuenta tus gastos, ingresos, metas e inversiones.</p>
              </div>
              {startersData?.starters && <div className="flex flex-wrap justify-center gap-2">
                  {startersData.starters.map(s => <button key={s} className="badge bg-ink-50 text-ink-600 hover:bg-ink-100" onClick={() => submit(s)}>
                      {s}
                    </button>)}
                </div>}
            </div> : <div className="flex flex-col gap-4">
              {messages.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-800"}`}>
                    {m.content}
                  </div>
                </div>)}
              {send.isPending && <div className="flex justify-start">
                  <div className="rounded-2xl bg-ink-50 px-4 py-2.5 text-sm text-ink-400">Escribiendo...</div>
                </div>}
              <div ref={bottomRef} />
            </div>}
        </div>

        <form className="flex gap-2 border-t border-ink-100 p-4" onSubmit={e => {
        e.preventDefault();
        submit(input);
      }}>
          <input className="input" placeholder="Escribí tu consulta..." value={input} onChange={e => setInput(e.target.value)} />
          <button className="btn-primary" type="submit" disabled={send.isPending || !input.trim()}>
            <LuSend className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>;
}
