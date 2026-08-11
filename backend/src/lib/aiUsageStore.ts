import crypto from "node:crypto";
import { db } from "../db/index.js";

// ===========================================================================
//  Historial persistente de consumo de IA. `lib/usage.ts` mantiene un
//  acumulado en MEMORIA para `/api/usage` (se resetea con cada reinicio —
//  ya perdimos el histórico real dos veces esta semana por los reinicios del
//  incidente de Postgres). Aquí se guarda cada llamada individual, con la
//  operación (`toolName` de `structuredCompletion`, p. ej. "venta_result" o
//  "coaching_oportunidades_result") para poder comparar consumo por agente/
//  pasada — en particular, Call Intelligence en Gemini vs. Claude.
//
//  Tabla propia con `CREATE TABLE IF NOT EXISTS` bajo demanda (mismo patrón
//  que `activitySummaryCache.ts`) — no se toca `db/schema.ts`, que tiene
//  cambios sin commitear del compañero.
// ===========================================================================

let tablaLista = false;
async function ensureTabla(): Promise<void> {
  if (tablaLista) return;
  await db.run(`
    CREATE TABLE IF NOT EXISTS ai_usage_log (
      id                    TEXT PRIMARY KEY,
      model                 TEXT NOT NULL,
      operation             TEXT,
      input_tokens          INTEGER NOT NULL DEFAULT 0,
      output_tokens         INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL
    )
  `);
  tablaLista = true;
}

export interface UsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** Guarda una llamada individual a la IA. Nunca rompe al que la invoca (defensivo, fire-and-forget). */
export async function recordUsage(model: string, operation: string | null, u: UsageEntry): Promise<void> {
  try {
    await ensureTabla();
    await db.run(
      `INSERT INTO ai_usage_log
         (id, model, operation, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), model, operation, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheCreationTokens, new Date().toISOString()]
    );
  } catch (err) {
    console.error("[aiUsageStore] no se pudo guardar el uso:", err instanceof Error ? err.message : err);
  }
}

export interface UsageHistoricoFila {
  model: string;
  operation: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** Consulta agregada por modelo+operación, opcionalmente acotada por fecha (ISO) y operación. */
export async function usageHistorico(opts: { operation?: string; desde?: string; hasta?: string } = {}): Promise<{
  filas: UsageHistoricoFila[];
  totales: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
}> {
  await ensureTabla();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.operation) { where.push("operation = ?"); params.push(opts.operation); }
  if (opts.desde) { where.push("created_at >= ?"); params.push(opts.desde); }
  if (opts.hasta) { where.push("created_at <= ?"); params.push(opts.hasta); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const filas = await db.query<{
    model: string; operation: string | null; calls: number;
    input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number;
  }>(
    `SELECT model, operation, COUNT(*) as calls,
            SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
            SUM(cache_read_tokens) as cache_read_tokens, SUM(cache_creation_tokens) as cache_creation_tokens
       FROM ai_usage_log ${whereSql}
      GROUP BY model, operation
      ORDER BY input_tokens DESC`,
    params
  );

  const out: UsageHistoricoFila[] = filas.map((f) => ({
    model: f.model,
    operation: f.operation,
    calls: Number(f.calls) || 0,
    inputTokens: Number(f.input_tokens) || 0,
    outputTokens: Number(f.output_tokens) || 0,
    cacheReadTokens: Number(f.cache_read_tokens) || 0,
    cacheCreationTokens: Number(f.cache_creation_tokens) || 0
  }));

  const totales = out.reduce(
    (acc, f) => ({
      calls: acc.calls + f.calls,
      inputTokens: acc.inputTokens + f.inputTokens,
      outputTokens: acc.outputTokens + f.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + f.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens + f.cacheCreationTokens
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  );

  return { filas: out, totales };
}
