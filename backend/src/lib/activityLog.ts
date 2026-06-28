import { db } from "../db/index.js";

export type LogType = "info" | "success" | "warning" | "error";

export interface LogEntryInput {
  agentId: string;
  type: LogType;
  title: string;
  detail?: string | null;
  reference?: string | null;
  payload?: unknown;
  durationMs?: number | null;
}

/**
 * Registra un evento en la bitácora y actualiza el "last_run_at" del agente.
 * Es el punto único que deben usar todos los agentes para dejar rastro
 * de lo que hicieron (auditoría completa del sistema).
 *
 * Es AUTO-PROTEGIDO: nunca lanza. Así sus llamadas "fire-and-forget" (sin
 * await) son seguras y no tumban el flujo principal si la BD falla.
 * Devuelve el id del log, o null si no se pudo registrar.
 */
export async function logActivity(entry: LogEntryInput): Promise<number | null> {
  const now = new Date().toISOString();
  try {
    const row = await db.queryOne<{ id: number }>(
      `INSERT INTO logs (timestamp, agent_id, type, title, detail, reference, payload, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        now,
        entry.agentId,
        entry.type,
        entry.title,
        entry.detail ?? null,
        entry.reference ?? null,
        entry.payload !== undefined ? JSON.stringify(entry.payload) : null,
        entry.durationMs ?? null
      ]
    );
    await db.run(`UPDATE agents SET last_run_at = ?, updated_at = ? WHERE id = ?`, [
      now,
      now,
      entry.agentId
    ]);
    return row?.id ?? null;
  } catch (err) {
    console.error("[activityLog] no se pudo registrar el evento:", err);
    return null;
  }
}

/**
 * Helper para medir la duración de una tarea de agente y registrarla
 * automáticamente en la bitácora, ya sea que termine bien o con error.
 */
export async function withActivityLog<T>(
  base: Omit<LogEntryInput, "durationMs" | "type" | "title" | "detail" | "payload">,
  successTitle: string,
  fn: () => Promise<{ detail?: string; reference?: string | null; payload?: unknown } & T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await logActivity({
      ...base,
      type: "success",
      title: successTitle,
      detail: result.detail,
      reference: result.reference ?? base.reference ?? null,
      payload: result.payload,
      durationMs: Date.now() - start
    });
    return result;
  } catch (err) {
    await logActivity({
      ...base,
      type: "error",
      title: `${successTitle} (error)`,
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start
    });
    throw err;
  }
}
