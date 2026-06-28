import { Link } from "react-router-dom";
import type { Agent } from "../types";
import { StatusBadge } from "./Badge";

export function AgentCard({
  agent,
  onToggle
}: {
  agent: Agent;
  onToggle: (agent: Agent) => void;
}) {
  const isActive = agent.status === "active";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to={`/agents/${agent.id}`} className="font-semibold hover:text-accent">
            {agent.name}
          </Link>
          <div className="text-xs text-text-muted">{agent.role}</div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <p className="line-clamp-3 text-sm text-text-muted">{agent.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {agent.tools.slice(0, 4).map((tool) => (
          <span
            key={tool}
            className="rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-text-muted"
          >
            {tool}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          Modelo: <span className="text-text">{agent.model}</span>
        </span>
        <span>
          {agent.stats.total} eventos
          {agent.stats.errors > 0 && (
            <span className="ml-1 text-danger">· {agent.stats.errors} errores</span>
          )}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 border-t border-border pt-3">
        <button
          onClick={() => onToggle(agent)}
          disabled={agent.status === "error"}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            isActive
              ? "bg-warning/15 text-warning hover:bg-warning/25"
              : "bg-success/15 text-success hover:bg-success/25"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isActive ? "Pausar" : "Activar"}
        </button>
        <Link
          to={`/agents/${agent.id}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
        >
          Detalle
        </Link>
      </div>
    </div>
  );
}
