import { Router } from "express";
import { db } from "../db/index.js";
import { logActivity, type LogType } from "../lib/activityLog.js";

export const logsRouter = Router();

// GET /api/logs?agent=...&type=...&search=...&limit=...
logsRouter.get("/", async (req, res) => {
  const { agent, type, search, limit } = req.query as Record<string, string | undefined>;

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (agent && agent !== "all") {
    clauses.push("agent_id = ?");
    params.push(agent);
  }
  if (type && type !== "all") {
    clauses.push("type = ?");
    params.push(type);
  }
  if (search) {
    clauses.push("(title LIKE ? OR detail LIKE ? OR reference LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const lim = Math.min(Number(limit) || 200, 1000);

  const rows = await db.query(
    `SELECT logs.*, agents.name as agent_name
       FROM logs
       JOIN agents ON agents.id = logs.agent_id
       ${where}
       ORDER BY logs.timestamp DESC, logs.id DESC
       LIMIT ${lim}`,
    params
  );

  res.json(rows);
});

// POST /api/logs - crear entrada manual (desde el panel) o desde un agente
logsRouter.post("/", async (req, res) => {
  const { agentId, type, title, detail, reference, payload } = req.body ?? {};

  if (!agentId || !title) {
    return res.status(400).json({ error: "agentId y title son requeridos" });
  }

  const validTypes: LogType[] = ["info", "success", "warning", "error"];
  const logType: LogType = validTypes.includes(type) ? type : "info";

  const agentExists = await db.queryOne("SELECT 1 as ok FROM agents WHERE id = ?", [agentId]);
  if (!agentExists) return res.status(404).json({ error: "Agente no encontrado" });

  const id = await logActivity({
    agentId,
    type: logType,
    title,
    detail,
    reference,
    payload
  });

  const row = await db.queryOne("SELECT * FROM logs WHERE id = ?", [id]);
  res.status(201).json(row);
});

// GET /api/logs/export - exporta toda la bitácora como JSON
logsRouter.get("/export", async (_req, res) => {
  const rows = await db.query(
    `SELECT logs.*, agents.name as agent_name
       FROM logs JOIN agents ON agents.id = logs.agent_id
       ORDER BY logs.timestamp ASC`
  );

  res.setHeader("Content-Disposition", "attachment; filename=maxirent-bitacora.json");
  res.json(rows);
});
