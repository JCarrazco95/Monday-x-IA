import { db } from "./index.js";
import { parseReference, safeParseJson } from "../lib/references.js";
import type { CallIntelligenceOutput, LeadEnrichmentOutput, FormAnalysisOutput } from "../agents/types.js";

// ===========================================================================
//  A.3 — Capa de dominio: `call_analyses`.
//
//  `logs` es la AUDITORÍA (se conserva intacta); esta tabla es el camino de
//  LECTURA principal para Call Intelligence: una fila por llamada (la última
//  versión del análisis), con columnas indexadas para lista/detalle/filtros.
//  Escribe el orquestador tras cada análisis (write-through) y un backfill
//  puebla la tabla desde `logs` al arrancar si está vacía (migración suave,
//  sin pasos manuales).
// ===========================================================================

export interface CallAnalysisRow {
  item_id: string;
  item_name: string;
  telefono: string | null;
  vendedor: string | null;
  sandler_score: number | null;
  challenger_score: number | null;
  global_score: number | null;
  banda: string | null;
  fuente: string | null;
  payload: string;
  analyzed_at: string;
}

/** Inserta/actualiza el análisis de una llamada (última versión gana). */
export async function saveCallAnalysis(
  itemId: string,
  itemName: string,
  call: CallIntelligenceOutput,
  analyzedAt?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO call_analyses
       (item_id, item_name, telefono, vendedor, sandler_score, challenger_score,
        global_score, banda, fuente, payload, analyzed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       item_name = excluded.item_name,
       telefono = excluded.telefono,
       vendedor = excluded.vendedor,
       sandler_score = excluded.sandler_score,
       challenger_score = excluded.challenger_score,
       global_score = excluded.global_score,
       banda = excluded.banda,
       fuente = excluded.fuente,
       payload = excluded.payload,
       analyzed_at = excluded.analyzed_at,
       updated_at = excluded.updated_at`,
    [
      itemId,
      itemName,
      call.telefono ?? null,
      call.vendedorNombre ?? null,
      call.sandler?.puntajeFinal ?? null,
      call.challenger?.score ?? null,
      call.integrado?.scoreGlobal ?? null,
      call.integrado?.banda ?? call.sandler?.banda ?? null,
      call.fuenteAnalisis ?? null,
      JSON.stringify(call),
      analyzedAt ?? now,
      now
    ]
  );
}

/**
 * Puebla `call_analyses` desde la bitácora (último payload por referencia).
 * Idempotente (upsert). Se ejecuta al arrancar si la tabla está vacía, para
 * que los despliegues existentes migren solos. Devuelve cuántas migró.
 */
export async function backfillCallAnalyses(): Promise<number> {
  const rows = await db.query<{ reference: string; payload: string; timestamp: string }>(
    `SELECT l.reference, l.payload, l.timestamp
       FROM logs l
       JOIN (
         SELECT reference, MAX(id) AS mid
           FROM logs
          WHERE agent_id = 'call_intelligence' AND payload IS NOT NULL AND reference IS NOT NULL
          GROUP BY reference
       ) m ON l.id = m.mid`
  );
  let migradas = 0;
  for (const r of rows) {
    const call = safeParseJson<CallIntelligenceOutput>(r.payload);
    if (!call || !call.sandler) continue; // solo payloads de análisis completos
    const { itemId, itemName } = parseReference(r.reference);
    await saveCallAnalysis(itemId, itemName, call, r.timestamp);
    migradas++;
  }
  return migradas;
}

/** Backfill automático al arrancar: solo si la tabla está vacía. */
export async function ensureCallAnalysesPopulated(): Promise<void> {
  const row = await db.queryOne<{ c: number }>(
    "SELECT CAST(COUNT(*) AS INTEGER) as c FROM call_analyses"
  );
  if ((row?.c ?? 0) > 0) return;
  const n = await backfillCallAnalyses();
  if (n > 0) console.log(`   Dominio: call_analyses poblada desde la bitácora (${n} llamadas).`);
}

// ===========================================================================
//  A.3 fase 2 — `lead_analyses`.
//  Una fila por lead: enriquecimiento (lead_payload) + formulario (form_payload)
//  del mismo item. email/rfc indexados → dedupe sin LIKE sobre logs.
// ===========================================================================

export interface LeadAnalysisRow {
  item_id: string;
  item_name: string;
  score: number | null;
  prioridad: string | null;
  riesgo: string | null;
  duplicado: number;
  email: string | null;
  telefono: string | null;
  rfc: string | null;
  razon_social: string | null;
  lead_payload: string | null;
  form_payload: string | null;
  analyzed_at: string;
}

/** Inserta/actualiza el ANÁLISIS DE LEAD (enriquecimiento). Conserva el form_payload previo. */
export async function saveLeadAnalysis(
  itemId: string,
  itemName: string,
  lead: LeadEnrichmentOutput,
  contacto: { email?: string | null; telefono?: string | null; rfc?: string | null; razonSocial?: string | null },
  analyzedAt?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO lead_analyses
       (item_id, item_name, score, prioridad, riesgo, duplicado, email, telefono, rfc, razon_social,
        lead_payload, analyzed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       item_name = excluded.item_name,
       score = excluded.score,
       prioridad = excluded.prioridad,
       riesgo = excluded.riesgo,
       duplicado = excluded.duplicado,
       email = COALESCE(excluded.email, lead_analyses.email),
       telefono = COALESCE(excluded.telefono, lead_analyses.telefono),
       rfc = COALESCE(excluded.rfc, lead_analyses.rfc),
       razon_social = COALESCE(excluded.razon_social, lead_analyses.razon_social),
       lead_payload = excluded.lead_payload,
       analyzed_at = excluded.analyzed_at,
       updated_at = excluded.updated_at`,
    [
      itemId,
      itemName,
      lead.score ?? null,
      lead.prioridad ?? null,
      lead.riesgo ?? null,
      lead.duplicado ? 1 : 0,
      contacto.email ?? null,
      contacto.telefono ?? null,
      contacto.rfc ?? null,
      contacto.razonSocial ?? null,
      JSON.stringify(lead),
      analyzedAt ?? now,
      now
    ]
  );
}

/** Inserta/actualiza el ANÁLISIS DE FORMULARIO del lead. Conserva el lead_payload previo. */
export async function saveFormAnalysis(
  itemId: string,
  itemName: string,
  form: FormAnalysisOutput,
  analyzedAt?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO lead_analyses (item_id, item_name, form_payload, duplicado, analyzed_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       item_name = excluded.item_name,
       form_payload = excluded.form_payload,
       analyzed_at = excluded.analyzed_at,
       updated_at = excluded.updated_at`,
    [itemId, itemName, JSON.stringify(form), analyzedAt ?? now, now]
  );
}

/**
 * Duplicado por email/RFC usando los índices de la tabla (antes: LIKE sobre
 * todo el JSON de logs). Excluye el propio item (re-análisis).
 */
export async function findDuplicateLead(
  input: { itemId: string; email?: string | null; rfc?: string | null }
): Promise<{ itemId: string; itemName: string } | null> {
  if (!input.email && !input.rfc) return null;
  const row = await db.queryOne<{ item_id: string; item_name: string }>(
    `SELECT item_id, item_name FROM lead_analyses
      WHERE item_id != ?
        AND ((email IS NOT NULL AND email = ?) OR (rfc IS NOT NULL AND rfc = ?))
      ORDER BY analyzed_at DESC LIMIT 1`,
    [input.itemId, input.email ?? "__sin_email__", input.rfc ?? "__sin_rfc__"]
  );
  return row ? { itemId: row.item_id, itemName: row.item_name } : null;
}

/** Puebla `lead_analyses` desde la bitácora (último payload por referencia). */
export async function backfillLeadAnalyses(): Promise<number> {
  const rows = await db.query<{ reference: string; agent_id: string; payload: string; timestamp: string }>(
    `SELECT l.reference, l.agent_id, l.payload, l.timestamp
       FROM logs l
       JOIN (
         SELECT reference, agent_id, MAX(id) AS mid
           FROM logs
          WHERE agent_id IN ('lead_enrichment','form_analysis')
            AND payload IS NOT NULL AND reference IS NOT NULL
          GROUP BY reference, agent_id
       ) m ON l.id = m.mid
      ORDER BY l.timestamp ASC`
  );
  let migradas = 0;
  for (const r of rows) {
    const { itemId, itemName } = parseReference(r.reference);
    if (r.agent_id === "lead_enrichment") {
      // El orquestador loguea { ...analisis, email, rfc, telefono, razonSocial }.
      const p = safeParseJson<LeadEnrichmentOutput & { email?: string; telefono?: string; rfc?: string; razonSocial?: string }>(r.payload);
      if (!p || typeof p.score !== "number") continue;
      await saveLeadAnalysis(
        itemId,
        itemName,
        p,
        { email: p.email, telefono: p.telefono, rfc: p.rfc, razonSocial: p.razonSocial },
        r.timestamp
      );
      migradas++;
    } else {
      const p = safeParseJson<FormAnalysisOutput>(r.payload);
      if (!p || !p.vehiculoInteres) continue;
      await saveFormAnalysis(itemId, itemName, p, r.timestamp);
      migradas++;
    }
  }
  return migradas;
}

/** Backfill automático al arrancar: solo si la tabla está vacía. */
export async function ensureLeadAnalysesPopulated(): Promise<void> {
  const row = await db.queryOne<{ c: number }>(
    "SELECT CAST(COUNT(*) AS INTEGER) as c FROM lead_analyses"
  );
  if ((row?.c ?? 0) > 0) return;
  const n = await backfillLeadAnalyses();
  if (n > 0) console.log(`   Dominio: lead_analyses poblada desde la bitácora (${n} análisis).`);
}
