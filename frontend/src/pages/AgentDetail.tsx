import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Agent } from "../types";
import { StatusBadge } from "../components/Badge";
import { ActivityFeedItem } from "../components/LogRow";

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    api
      .getAgent(id)
      .then(setAgent)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
        {error}
      </div>
    );
  if (!agent) return <div className="text-text-muted">Cargando...</div>;

  const handleToggle = async () => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    const updated = await api.updateAgent(agent.id, { status: newStatus });
    setAgent({ ...agent, ...updated });
  };

  return (
    <div className="flex flex-col gap-6">
      <Link to="/agents" className="text-sm text-text-muted hover:text-text">
        ← Volver a agentes
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <p className="mt-1 text-sm text-text-muted">{agent.role}</p>
        </div>
        <button
          onClick={handleToggle}
          disabled={agent.status === "error"}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            agent.status === "active"
              ? "bg-warning/15 text-warning hover:bg-warning/25"
              : "bg-success/15 text-success hover:bg-success/25"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {agent.status === "active" ? "Pausar agente" : "Activar agente"}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-base font-semibold">Descripción</h2>
            <p className="text-sm text-text-muted">{agent.description}</p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold">Actividad reciente</h2>
            <div className="flex flex-col">
              {!agent.recentLogs || agent.recentLogs.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">
                  Sin eventos registrados todavía.
                </p>
              ) : (
                agent.recentLogs.map((log) => <ActivityFeedItem key={log.id} log={log} />)
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold">Configuración</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="ID" value={agent.id} mono />
              <Row label="Modelo" value={agent.model} mono />
              <Row label="Versión" value={agent.version} />
              <Row label="Prioridad" value={String(agent.priority)} />
              <Row
                label="Última ejecución"
                value={agent.last_run_at ? new Date(agent.last_run_at + "Z").toLocaleString("es-MX") : "—"}
              />
            </dl>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold">Herramientas (tools)</h2>
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((tool) => (
                <span
                  key={tool}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-muted"
                >
                  {tool}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold">Estadísticas</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Total de eventos" value={String(agent.stats?.total ?? 0)} />
              <Row
                label="Errores"
                value={String(agent.stats?.errors ?? 0)}
                valueClass={(agent.stats?.errors ?? 0) > 0 ? "text-danger" : undefined}
              />
              <Row
                label="Último evento"
                value={
                  agent.stats?.last_event
                    ? new Date(agent.stats.last_event).toLocaleString("es-MX")
                    : "—"
                }
              />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  valueClass
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`${mono ? "font-mono text-xs" : ""} ${valueClass ?? ""}`}>{value}</dd>
    </div>
  );
}
