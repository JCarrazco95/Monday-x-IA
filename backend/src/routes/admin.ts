import { Router } from "express";
import { db } from "../db/index.js";
import { logActivity } from "../lib/activityLog.js";
import { itemIdOf } from "../lib/references.js";

// ===========================================================================
//  Administración — limpieza de datos demo/fallback.
//
//  Problema que resuelve: cuando la IA no estaba disponible (sin créditos, sin
//  key), los agentes generaban análisis con HEURÍSTICAS y quedaban guardados en
//  `logs` mezclados con los reales. Estos endpoints los detectan por sus firmas
//  ("modo demo", "Estimacion en modo demo", fuenteAnalisis demo/fallback…) y
//  permiten borrarlos para re-analizar con IA real.
//
//    GET  /api/admin/demo-data   → PREVIEW: cuántos y cuáles (no borra nada).
//    POST /api/admin/purge-demo  → BORRA. Requiere body { "confirm": true }.
// ===========================================================================

export const adminRouter = Router();

// Firmas de texto que solo aparecen en payloads generados por heurísticas.
const DEMO_MARKERS = [
  "%modo demo%",                 // "(modo demo…", "modo demo, sin IA", etc.
  "%resumen demo%",
  "%narrativa demo%",
  "%valoracion demo%",
  "%Estimacion en modo demo%",
  '%"fuenteAnalisis":"demo"%',
  '%"fuenteAnalisis":"fallback"%'
];

// Referencias creadas por los botones "Simular …" del panel (datos ficticios).
const SIM_MARKERS = ["%Sofía Ramírez%", "%Carlos Méndez%", "%Juan Garcia%", "%8112345678%"];

const AGENTS = ["call_intelligence", "lead_enrichment", "form_analysis"];

function buildWhere(includeSims: boolean): { where: string; params: string[] } {
  const markers = includeSims ? [...DEMO_MARKERS, ...SIM_MARKERS] : DEMO_MARKERS;
  const likes = markers.map(() => "payload LIKE ?").join(" OR ");
  const agents = AGENTS.map(() => "?").join(",");
  return {
    where: `agent_id IN (${agents}) AND payload IS NOT NULL AND (${likes})`,
    params: [...AGENTS, ...markers]
  };
}

// GET /api/admin/demo-data → preview de lo que se borraría (no toca nada).
adminRouter.get("/demo-data", async (req, res) => {
  try {
    const includeSims = req.query.sims !== "false";
    const { where, params } = buildWhere(includeSims);
    const rows = await db.query<{ agent_id: string; reference: string | null }>(
      `SELECT agent_id, reference FROM logs WHERE ${where}`,
      params
    );
    const porAgente: Record<string, number> = {};
    const referencias = new Set<string>();
    for (const r of rows) {
      porAgente[r.agent_id] = (porAgente[r.agent_id] ?? 0) + 1;
      if (r.reference) referencias.add(r.reference);
    }
    res.json({
      total: rows.length,
      porAgente,
      referenciasAfectadas: referencias.size,
      muestra: [...referencias].slice(0, 15),
      nota: "Esto es un preview. Para borrar: POST /api/admin/purge-demo con body {\"confirm\":true}."
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/admin/purge-demo { confirm: true, sims?: boolean }
adminRouter.post("/purge-demo", async (req, res) => {
  const { confirm, sims } = (req.body ?? {}) as { confirm?: boolean; sims?: boolean };
  if (confirm !== true) {
    return res.status(400).json({
      error: "Confirmación requerida: envía {\"confirm\": true}. Usa GET /api/admin/demo-data para ver qué se borraría."
    });
  }
  try {
    const includeSims = sims !== false;
    const { where, params } = buildWhere(includeSims);
    // Capturamos las referencias afectadas ANTES de borrar, para poder liberar
    // sus firmas de idempotencia (monday_writes) y que el re-análisis real
    // pueda volver a comentar/crear subitems en Monday.
    const rows = await db.query<{ reference: string | null }>(
      `SELECT reference FROM logs WHERE ${where}`,
      params
    );
    const itemIds = [...new Set(rows.map((r) => (r.reference ? itemIdOf(r.reference) : null)).filter(Boolean))] as string[];

    await db.run(`DELETE FROM logs WHERE ${where}`, params);
    try {
      for (let i = 0; i < itemIds.length; i += 100) {
        const chunk = itemIds.slice(i, i + 100);
        const ph = chunk.map(() => "?").join(",");
        await db.run(`DELETE FROM monday_writes WHERE item_id IN (${ph})`, chunk);
        // La tabla de dominio (A.3) también se limpia: sus filas provienen de
        // los mismos análisis que se están purgando.
        await db.run(`DELETE FROM call_analyses WHERE item_id IN (${ph})`, chunk);
      }
      // Y cualquier fila de dominio con firma demo que no tuviera log asociado.
      const demoLikes = DEMO_MARKERS.map(() => "payload LIKE ?").join(" OR ");
      await db.run(`DELETE FROM call_analyses WHERE ${demoLikes}`, DEMO_MARKERS);
    } catch { /* tablas pueden no existir en BDs viejas; no es crítico */ }

    const borrados = rows.length;
    logActivity({
      agentId: "orchestrator",
      type: "warning",
      title: `Limpieza de datos demo: ${borrados} registro(s) eliminados`,
      detail: `Se eliminaron análisis generados por heurísticas (demo/fallback)${includeSims ? " y simulaciones" : ""}. Las llamadas afectadas se re-analizarán con IA real en el próximo sync.`
    });
    res.json({ ok: true, borrados });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
