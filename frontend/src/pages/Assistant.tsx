import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, User, Bot } from "lucide-react";
import { api } from "../lib/api";

// ===========================================================================
//  Asistente comercial — Chat RAG sobre el histórico (logs).
//  "Habla con tus leads": pregunta en lenguaje natural y responde con base en
//  el histórico de análisis. POST /api/assistant/chat.
// ===========================================================================

interface Msg {
  role: "user" | "assistant";
  text: string;
  citados?: string[];
}

const SUGERENCIAS = [
  "¿Qué leads objetaron el precio?",
  "¿Qué clientes de construcción tenemos?",
  "¿Dónde hay oportunidades de expansión de flota?",
  "¿Qué llamadas tienen banderas rojas?",
  "¿Qué leads calientes hay sin seguimiento?"
];

export function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setLoading(true);
    try {
      const r = await api.askAssistant(question);
      setMessages((m) => [...m, { role: "assistant", text: r.respuesta, citados: r.itemsCitados }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
          <Sparkles className="text-accent" /> Asistente comercial
        </h1>
        <p className="mt-1 text-sm text-text-muted">Pregunta en lenguaje natural sobre tus leads y llamadas analizadas.</p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-3 text-accent" size={36} />
            <p className="mb-4 max-w-md text-sm text-text-muted">
              Consulta el histórico comercial: objeciones, sectores, oportunidades, riesgos, seguimiento… Prueba con:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-bg px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-accent text-white" : "bg-accent/10 text-accent"}`}>
                  {m.role === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] ${m.role === "user" ? "bg-accent text-white" : "border border-border bg-bg text-text"}`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  {m.citados && m.citados.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                      {[...new Set(m.citados)].map((c) => (
                        <span key={c} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"><Bot size={16} /></div>
                <div className="rounded-2xl border border-border bg-bg px-4 py-2.5 text-[13px] text-text-muted">Consultando el histórico…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta sobre tus leads y llamadas…"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={16} /> Enviar
        </button>
      </form>
    </div>
  );
}
