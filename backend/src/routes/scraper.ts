import { Router } from "express";
import { listLeadSources } from "../lib/leadSources.js";
import { searchProspects, importProspects } from "../agents/leadScraperAgent.js";
import { diagnoseLusha } from "../lib/lusha.js";
import type { Prospect } from "../lib/leadSources.js";

// ===========================================================================
//  Scraper / prospección de leads.
//    GET  /api/scraper/sources   → fuentes disponibles (id, label, enabled).
//    POST /api/scraper/search    → PREVIEW de prospectos (no escribe).
//    POST /api/scraper/import    → alta de los prospectos seleccionados.
// ===========================================================================

export const scraperRouter = Router();

scraperRouter.get("/sources", (_req, res) => {
  res.json({ sources: listLeadSources() });
});

// Diagnóstico de Lusha: chequeo de salud (status HTTP) sin gastar créditos ni
// exponer la API key o datos de contactos.
scraperRouter.get("/lusha/diagnose", async (req, res) => {
  const sector = typeof req.query.sector === "string" ? req.query.sector : undefined;
  const ciudad = typeof req.query.ciudad === "string" ? req.query.ciudad : undefined;
  res.json(await diagnoseLusha({ sector, ciudad }));
});

scraperRouter.post("/search", async (req, res) => {
  const { source, sector, ciudad, limite } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof source !== "string" || !source.trim()) {
    return res.status(400).json({ error: "Se requiere 'source'." });
  }
  if (typeof sector !== "string" || !sector.trim()) {
    return res.status(400).json({ error: "Se requiere 'sector' (qué buscar)." });
  }
  try {
    const result = await searchProspects({
      source: source.trim(),
      sector: sector.trim(),
      ciudad: typeof ciudad === "string" ? ciudad.trim() : undefined,
      limite: typeof limite === "number" ? limite : undefined
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

scraperRouter.post("/import", async (req, res) => {
  const { prospects } = (req.body ?? {}) as { prospects?: Prospect[] };
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: "Se requiere 'prospects' (lista no vacía)." });
  }
  // Sanea: solo aceptamos los que traen nombre.
  const clean = prospects.filter((p) => p && typeof p.nombre === "string" && p.nombre.trim());
  if (clean.length === 0) {
    return res.status(400).json({ error: "Ningún prospecto válido (falta 'nombre')." });
  }
  try {
    const result = await importProspects(clean);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
