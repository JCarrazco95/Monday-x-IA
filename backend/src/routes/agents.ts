import { Router } from "express";
import { db } from "../db/index.js";
import { logActivity } from "../lib/activityLog.js";

export const agentsRouter = Router();

interface AgentRow {
  id: string;
  name: string;
  role: string;
  description: string;
  priority: number;
  status: "active" | "paused" | "error";
  model: string;
  tools: string;
  version: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

function serializeAgent(row: AgentRow) {
  return {
    ...row,
    tools: JSON.parse(row.tools)
  };
}

interface AgentStatsRow {
  agent_id: string;
  total: number;
  errors: number;
  last_event: string | null;
}

const emptyStats = (agentId: string): AgentStatsRow => ({
  agent_id: agentId,
  total: 0,
  errors: 0,
  last_event: null
});

const STATS_SQL = `SELECT agent_id,
              CAST(COUNT(*) AS INTEGER) as total,
              CAST(SUM(CASE WHEN type='error' THEN 1 ELSE 0 END) AS INTEGER) as errors,
              MAX(timestamp) as last_event
       FROM logs`;

async function getAgentStats(agentId: string): Promise<AgentStatsRow> {
  const row = await db.queryOne<AgentStatsRow>(
    `${STATS_SQL} WHERE agent_id = ? GROUP BY agent_id`,
    [agentId]
  );
  return row ?? emptyStats(agentId);
}

// GET /api/agents - lista todos los agentes con stats básicas
agentsRouter.get("/", async (_req, res) => {
  const rows = await db.query<AgentRow>("SELECT * FROM agents ORDER BY priority ASC");
  const counts = await db.query<AgentStatsRow>(`${STATS_SQL} GROUP BY agent_id`);
  const countsMap = Object.fromEntries(counts.map((c) => [c.agent_id, c]));

  res.json(
    rows.map((row) => ({
      ...serializeAgent(row),
      stats: countsMap[row.id] ?? emptyStats(row.id)
    }))
  );
});

// GET /api/agents/:id - detalle de un agente + últimos runs/logs
agentsRouter.get("/:id", async (req, res) => {
  const row = await db.queryOne<AgentRow>("SELECT * FROM agents WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Agente no encontrado" });

  const recentLogs = await db.query(
    "SELECT * FROM logs WHERE agent_id = ? ORDER BY timestamp DESC, id DESC LIMIT 25",
    [req.params.id]
  );

  res.json({ ...serializeAgent(row), stats: await getAgentStats(row.id), recentLogs });
});

// PATCH /api/agents/:id - actualizar status (active | paused) u otros campos
agentsRouter.patch("/:id", async (req, res) => {
  const { status, model } = req.body ?? {};

  const existing = await db.queryOne<AgentRow>("SELECT * FROM agents WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Agente no encontrado" });

  if (status && !["active", "paused", "error"].includes(status)) {
    return res.status(400).json({ error: "status inválido" });
  }

  await db.run(
    `UPDATE agents SET
       status = COALESCE(?, status),
       model = COALESCE(?, model),
       updated_at = ?
     WHERE id = ?`,
    [status ?? null, model ?? null, new Date().toISOString(), req.params.id]
  );

  if (status && status !== existing.status) {
    logActivity({
      agentId: req.params.id,
      type: "info",
      title: `Estado cambiado: ${existing.status} → ${status}`,
      detail: "Cambio realizado desde el panel de control."
    });
  }

  const updated = await db.queryOne<AgentRow>("SELECT * FROM agents WHERE id = ?", [req.params.id]);
  res.json(serializeAgent(updated as AgentRow));
});
