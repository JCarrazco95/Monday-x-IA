import { Router } from "express";
import { db } from "../db/index.js";
import { runNextBestActionAgent, AGENT_ID } from "../agents/nextBestActionAgent.js";

// ===========================================================================
//  Next Best Action — endpoints.
//   GET  /api/nba        → vista previa (solo lectura, no escribe en Monday).
//   POST /api/nba/run    → ejecuta y ESCRIBE alertas de alta prioridad en Monday.
//                          Pensado para un cron diario o un botón del panel.
// ===========================================================================

export const nbaRouter = Router();

async function isActive(): Promise<boolean> {
  const row = await db.queryOne<{ status: string }>("SELECT status FROM agents WHERE id = ?", [
    AGENT_ID
  ]);
  return (row?.status ?? "paused") === "active";
}

// Vista previa: calcula la agenda de seguimiento sin tocar Monday.
nbaRouter.get("/", async (_req, res) => {
  try {
    const report = await runNextBestActionAgent({ write: false });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Ejecución real: escribe las alertas de alta prioridad en Monday.
nbaRouter.post("/run", async (_req, res) => {
  if (!(await isActive())) {
    return res.status(200).json({ skipped: true, reason: "agent_paused" });
  }
  try {
    const report = await runNextBestActionAgent({ write: true });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
