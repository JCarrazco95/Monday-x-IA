// ===========================================================================
//  Agente Lead Scraper — prospección y alta masiva de leads.
//
//  Dos operaciones:
//    1) searchProspects()  → PREVIEW. Consulta una fuente conectable y devuelve
//       prospectos normalizados, marcando los que parecen DUPLICADOS de leads
//       ya existentes. NO escribe nada.
//    2) importProspects()  → ALTA. Por cada prospecto seleccionado: crea el item
//       en Monday y dispara `lead_created` (enriquecimiento + scoring con IA +
//       Writer). Reusa exactamente el mismo flujo que la landing (/intake), así
//       cada lead scrapeado se enriquece y califica igual que los orgánicos.
//
//  El dedupe es defensivo a dos niveles: aquí (contra nombres ya registrados en
//  la bitácora) y en leadEnrichmentAgent (detección de duplicados en el board).
// ===========================================================================

import { db } from "../db/index.js";
import { createMondayItem } from "../lib/monday.js";
import { logActivity } from "../lib/activityLog.js";
import { handleOrchestratorEvent } from "./orchestratorAgent.js";
import { getLeadSource, type Prospect, type SearchParams } from "../lib/leadSources.js";

export interface ScoredProspect extends Prospect {
  /** Coincide con un lead ya existente (mismo nombre normalizado). */
  duplicado: boolean;
}

export interface SearchResult {
  fuente: string;
  demo: boolean;
  total: number;
  nuevos: number;
  duplicados: number;
  prospects: ScoredProspect[];
}

const normalize = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Nombres de leads ya existentes (reconstruidos desde la bitácora). */
async function existingLeadNames(): Promise<Set<string>> {
  try {
    const rows = await db.query<{ reference: string }>(
      `SELECT DISTINCT reference FROM logs WHERE reference IS NOT NULL`,
      []
    );
    const set = new Set<string>();
    for (const r of rows) {
      // reference: "#<itemId> · <itemName>"
      const m = r.reference?.match(/^#\S+\s*·\s*(.+)$/);
      if (m?.[1]) set.add(normalize(m[1]));
    }
    return set;
  } catch {
    return new Set();
  }
}

export async function searchProspects(params: SearchParams & { source: string }): Promise<SearchResult> {
  const source = getLeadSource(params.source);
  if (!source) throw new Error(`Fuente desconocida: ${params.source}`);

  const { prospects, demo } = await source.search(params);
  const existing = await existingLeadNames();

  // Dedupe contra existentes + dentro del mismo lote.
  const seenInBatch = new Set<string>();
  const scored: ScoredProspect[] = prospects.map((p) => {
    const key = normalize(p.nombre);
    const dupExisting = existing.has(key);
    const dupBatch = seenInBatch.has(key);
    seenInBatch.add(key);
    return { ...p, duplicado: dupExisting || dupBatch };
  });

  const duplicados = scored.filter((p) => p.duplicado).length;
  logActivity({
    agentId: "lead_scraper",
    type: "info",
    title: `Prospección: ${source.label}`,
    detail: `"${params.sector}"${params.ciudad ? ` · ${params.ciudad}` : ""} → ${scored.length} prospecto(s), ${scored.length - duplicados} nuevo(s)${demo ? " (demo)" : ""}`,
    reference: `scraper · ${source.id}`
  });

  return {
    fuente: source.id,
    demo,
    total: scored.length,
    nuevos: scored.length - duplicados,
    duplicados,
    prospects: scored
  };
}

export interface ImportResult {
  importados: number;
  omitidos: number;
  itemIds: string[];
  errores: { nombre: string; error: string }[];
}

export async function importProspects(prospects: Prospect[]): Promise<ImportResult> {
  const result: ImportResult = { importados: 0, omitidos: 0, itemIds: [], errores: [] };
  const existing = await existingLeadNames();
  const seen = new Set<string>();

  for (const p of prospects) {
    const key = normalize(p.nombre);
    if (!key) {
      result.omitidos++;
      continue;
    }
    if (existing.has(key) || seen.has(key)) {
      result.omitidos++;
      continue;
    }
    seen.add(key);

    try {
      // 1) Crea el item del lead en Monday (mock devuelve id simulado).
      const created = await createMondayItem({ itemName: p.nombre });
      const itemId = created?.create_item?.id ?? String(Date.now());

      // 2) Dispara el análisis (enriquecimiento + scoring + Writer).
      await handleOrchestratorEvent({
        eventType: "lead_created",
        item: { itemId, itemName: p.nombre },
        payload: {
          nombre: p.nombre,
          razonSocial: p.nombre,
          telefono: p.telefono ?? undefined,
          email: p.email ?? undefined,
          sitioWeb: p.sitioWeb ?? undefined,
          direccion: p.direccion ?? undefined,
          origen: `scraper:${p.fuente}`
        }
      });

      result.importados++;
      result.itemIds.push(itemId);
    } catch (err) {
      result.errores.push({ nombre: p.nombre, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logActivity({
    agentId: "lead_scraper",
    type: result.errores.length ? "warning" : "success",
    title: "Importación de prospectos",
    detail: `${result.importados} alta(s), ${result.omitidos} omitido(s) por duplicado${result.errores.length ? `, ${result.errores.length} error(es)` : ""}`,
    reference: `scraper · import`
  });

  return result;
}
