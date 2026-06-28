import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Agent } from "../types";
import { AgentCard } from "../components/AgentCard";

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAgents()
      .then(setAgents)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (agent: Agent) => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    const updated = await api.updateAgent(agent.id, { status: newStatus });
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, ...updated } : a)));
  };

  if (loading) return <div className="text-text-muted">Cargando...</div>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Agentes</h1>
        <p className="text-sm text-text-muted">
          Configuración y control de cada agente del sistema. Pausa o activa agentes individualmente.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} onToggle={handleToggle} />
        ))}
      </div>
    </div>
  );
}
