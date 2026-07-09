import { db } from "./index.js";
import { parseReference, safeParseJson } from "../lib/references.js";
import type { CallIntelligenceOutput } from "../agents/types.js";

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
