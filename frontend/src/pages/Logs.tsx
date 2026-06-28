import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { Agent, LogEntry } from "../types";
import { LogTableRow } from "../components/LogRow";

export function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentFilter, setAgentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getLogs({
        agent: agentFilter,
        type: typeFilter,
        search: search || undefined,
        limit: 300
      });
      setLogs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [agentFilter, typeFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bitácora</h1>
          <p className="text-sm text-text-muted">
            Registro histórico de eventos de todos los agentes
          </p>
        </div>
        <a
          href={api.exportLogsUrl()}
          download
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
        >
          ⬇ Exportar JSON
        </a>
      </header>

      <div className="flex flex-wrap gap-3">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="all">Todos los agentes</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="all">Todos los tipos</option>
          <option value="info">Info</option>
          <option value="success">Éxito</option>
          <option value="warning">Advertencia</option>
          <option value="error">Error</option>
        </select>

        <input
          type="text"
          placeholder="Buscar en bitácora..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-muted"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2.5 font-medium">Fecha / Hora</th>
              <th className="px-3 py-2.5 font-medium">Agente</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 font-medium">Evento</th>
              <th className="px-3 py-2.5 font-medium">Detalle</th>
              <th className="px-3 py-2.5 font-medium">Referencia</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-text-muted">
                  Cargando...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-text-muted">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              logs.map((log) => <LogTableRow key={log.id} log={log} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
