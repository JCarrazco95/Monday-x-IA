import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Agent } from "../types";

export function Settings() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [type, setType] = useState("info");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.getAgents().then((a) => {
      setAgents(a);
      if (a.length) setAgentId(a[0].id);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId || !title) return;
    try {
      await api.createLog({ agentId, type, title, detail, reference });
      setTitle("");
      setDetail("");
      setReference("");
      setStatus("✅ Entrada agregada a la bitácora.");
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-text-muted">Herramientas adicionales del panel de control</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-base font-semibold">Agregar entrada manual a la bitácora</h2>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Agente">
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tipo">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="info">Info</option>
                <option value="success">Éxito</option>
                <option value="warning">Advertencia</option>
                <option value="error">Error</option>
              </select>
            </Field>

            <Field label="Evento (título)">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ej. Lead calificado manualmente"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-text-muted"
              />
            </Field>

            <Field label="Detalle">
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={3}
                placeholder="Descripción del evento..."
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-text-muted"
              />
            </Field>

            <Field label="Referencia (Item Monday / Lead)">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej. #1042 - Juan García"
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-text-muted"
              />
            </Field>

            <button
              type="submit"
              className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Agregar a bitácora
            </button>

            {status && <p className="text-sm text-text-muted">{status}</p>}
          </form>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-base font-semibold">Acerca de este panel</h2>
          <div className="flex flex-col gap-3 text-sm text-text-muted">
            <p>
              Este panel controla el sistema de agentes IA de MAXIRent integrado con Monday.com.
              Toda la actividad de los agentes (Form Analysis, Lead Enrichment, Call Intelligence,
              Monday Writer y el Orquestador) queda registrada en la bitácora para auditoría.
            </p>
            <p>
              Los datos se almacenan en una base de datos SQLite local del backend
              (<code className="rounded bg-bg px-1 py-0.5 text-xs">backend/data/maxirent.db</code>).
            </p>
            <p>
              Mientras no se configuren <code className="rounded bg-bg px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> y{" "}
              <code className="rounded bg-bg px-1 py-0.5 text-xs">MONDAY_API_TOKEN</code> en{" "}
              <code className="rounded bg-bg px-1 py-0.5 text-xs">backend/.env</code>, el sistema
              corre en <strong>modo demo</strong>: los agentes generan resultados simulados pero
              registran la actividad real en la bitácora.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-text-muted">{label}</span>
      {children}
    </label>
  );
}
