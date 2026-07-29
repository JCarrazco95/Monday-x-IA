import { db } from "../db/index.js";
import { forecastMondayEnabled } from "./mondayForecast.js";
import { computeActivitySummaryGlobal, type ActivitySummaryGlobal } from "./journeyLeads.js";

// ===========================================================================
//  Caché del resumen GLOBAL de actividades (tipo + cantidad, todos los leads,
//  desde una fecha fija). El cálculo real (`computeActivitySummaryGlobal`,
//  en journeyLeads.ts) es costoso — pagina ~4000+ items del board de
//  Actividades de ventas y los updates() de TODOS los leads de Leads
//  Maxirent — así que NUNCA se corre en vivo desde una petición HTTP:
//  se recalcula en segundo plano (cron interno, ver `scheduleRefresh` más
//  abajo) y se guarda aquí; las rutas solo LEEN esta caché (instantáneo).
//
//  Tabla propia con `CREATE TABLE IF NOT EXISTS` ejecutado bajo demanda (no
//  se agrega a `db/schema.ts` para no tocar ese archivo compartido) — DDL
//  idéntico en SQLite/Postgres (TEXT PRIMARY KEY, sin autoincremento).
// ===========================================================================

const DESDE_DEFAULT = process.env.ACTIVIDADES_RESUMEN_DESDE ?? "2026-01-01";
const CACHE_ID = "global";

let tablaLista = false;
async function ensureTabla(): Promise<void> {
  if (tablaLista) return;
  await db.run(`
    CREATE TABLE IF NOT EXISTS actividad_resumen_cache (
      id           TEXT PRIMARY KEY,
      desde        TEXT NOT NULL,
      resumen_json TEXT NOT NULL,
      total        INTEGER NOT NULL,
      generado_at  TEXT NOT NULL,
      error        TEXT
    )
  `);
  tablaLista = true;
}

export interface ActivitySummaryCached extends ActivitySummaryGlobal {
  generadoEn: string;
  error?: string;
}

/** Lee el resumen ya calculado (instantáneo, sin tocar Monday). `null` si nunca se ha corrido el job. */
export async function getCachedActivitySummary(): Promise<ActivitySummaryCached | null> {
  await ensureTabla();
  const row = await db.queryOne<{ desde: string; resumen_json: string; total: number; generado_at: string; error: string | null }>(
    "SELECT desde, resumen_json, total, generado_at, error FROM actividad_resumen_cache WHERE id = ?",
    [CACHE_ID]
  );
  if (!row) return null;
  return {
    desde: row.desde,
    resumenPorTipo: JSON.parse(row.resumen_json),
    total: row.total,
    generadoEn: row.generado_at,
    ...(row.error ? { error: row.error } : {})
  };
}

let refrescando = false;

/** Recalcula el resumen global y lo guarda. Si Monday falla, conserva la caché anterior y solo anota el error. */
export async function refreshActivitySummary(desde: string = DESDE_DEFAULT): Promise<void> {
  if (refrescando) return; // evita solapar corridas si el cron dispara mientras una sigue en curso
  refrescando = true;
  await ensureTabla();
  try {
    const resumen = await computeActivitySummaryGlobal(desde);
    await db.run("DELETE FROM actividad_resumen_cache WHERE id = ?", [CACHE_ID]);
    await db.run(
      "INSERT INTO actividad_resumen_cache (id, desde, resumen_json, total, generado_at, error) VALUES (?, ?, ?, ?, ?, NULL)",
      [CACHE_ID, resumen.desde, JSON.stringify(resumen.resumenPorTipo), resumen.total, new Date().toISOString()]
    );
    console.log(`   Resumen de actividades: ${resumen.total} desde ${resumen.desde}.`);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error("   Resumen de actividades error:", motivo);
    // Se guarda el error SOLO si no hay ninguna caché previa — si ya había un
    // resumen bueno, se conserva intacto en vez de pisarlo con un fallo.
    const existe = await db.queryOne("SELECT 1 FROM actividad_resumen_cache WHERE id = ?", [CACHE_ID]);
    if (!existe) {
      await db.run(
        "INSERT INTO actividad_resumen_cache (id, desde, resumen_json, total, generado_at, error) VALUES (?, ?, ?, ?, ?, ?)",
        [CACHE_ID, desde, "[]", 0, new Date().toISOString(), motivo]
      );
    }
  } finally {
    refrescando = false;
  }
}

// "Cron" interno OPCIONAL: solo corre si ACTIVIDADES_RESUMEN_CRON_HOURS está
// definido en el entorno — mismo criterio que CALLS_SYNC_CRON_HOURS/
// NBA_CRON_HOURS/LEADS_SYNC_CRON_HOURS en este repo (todos apagados por
// defecto). El efecto se dispara solo al importarse este módulo (ya ocurre
// en el arranque normal vía forecast.ts), sin tocar index.ts. Primera
// corrida a los 5 min de levantar el servidor — de sobra para que el
// servidor esté sirviendo con normalidad antes de la carga pesada del job.
// Mientras no se defina la variable, el resumen solo se actualiza con el
// botón "Recalcular" (POST /actividades-agregado/refresh).
const CRON_HOURS = Number(process.env.ACTIVIDADES_RESUMEN_CRON_HOURS);
if (forecastMondayEnabled && Number.isFinite(CRON_HOURS) && CRON_HOURS > 0) {
  const tick = () => { refreshActivitySummary().catch(() => {}); };
  setTimeout(tick, 300_000).unref();
  setInterval(tick, CRON_HOURS * 3_600_000).unref();
}
