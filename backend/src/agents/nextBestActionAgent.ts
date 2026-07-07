import { db } from "../db/index.js";
import { logActivity } from "../lib/activityLog.js";
import { parseReference, safeParseJson } from "../lib/references.js";
import { runMondayWriterAgent } from "./mondayWriterAgent.js";
import type {
  NextBestAction,
  NextBestActionReport,
  NextBestActionType,
  LeadEnrichmentOutput,
  CallIntelligenceOutput
} from "./types.js";

export const AGENT_ID = "next_best_action";

// ===========================================================================
//  Next Best Action Agent — "el supervisor que nunca olvida".
//
//  Es un agente DETERMINISTA (sin IA): recorre la bitácora `logs`, reconstruye
//  el estado de cada lead/llamada y levanta alertas accionables de seguimiento:
//   - compromisos pactados en llamada que no han tenido seguimiento (o vencidos),
//   - leads calientes/tibios que se están enfriando sin contacto,
//   - llamadas con banderas rojas o baja probabilidad de cierre.
//
//  Escribe las alertas de vuelta a Monday (columna "requiere_atencion" + un
//  comentario) para que las AUTOMATIZACIONES NATIVAS de Monday notifiquen al
//  vendedor. Pensado para correr a diario (cron) o bajo demanda desde el panel.
// ===========================================================================

// Umbrales (horas) configurables por entorno.
const H_CALIENTE = Number(process.env.NBA_HORAS_CALIENTE ?? 24);
const H_TIBIA = Number(process.env.NBA_HORAS_TIBIA ?? 72);
const H_COMPROMISO = Number(process.env.NBA_HORAS_COMPROMISO ?? 24);

const PRIO_RANK: Record<NextBestAction["prioridad"], number> = { alta: 0, media: 1, baja: 2 };

interface LogRow {
  reference: string;
  agent_id: string;
  payload: string | null;
  timestamp: string;
}

interface ItemSnapshot {
  reference: string;
  itemId: string;
  itemName: string;
  lead: LeadEnrichmentOutput | null;
  call: CallIntelligenceOutput | null;
  callTs: string | null;       // timestamp de la última llamada analizada
  lastActivityTs: string | null; // última actividad real (excluye al propio NBA)
}

function hoursBetween(fromIso: string | null, now: Date): number {
  if (!fromIso) return Infinity;
  const t = Date.parse(fromIso.includes("T") ? fromIso : fromIso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, (now.getTime() - t) / 3_600_000);
}

const MESES: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

/**
 * Intenta parsear una fecha de compromiso a partir de texto en español.
 * Soporta ISO (2026-07-12), dd/mm[/aaaa], dd-mm[-aaaa] y "12 de julio[ de 2026]".
 * Devuelve null si no hay una fecha CONCRETA (p.ej. "el viernes", "próxima semana"),
 * en cuyo caso el compromiso se trata como "sin fecha clara".
 */
export function parseFechaCompromiso(texto: string | undefined | null, now: Date): Date | null {
  if (!texto) return null;
  const t = texto.toLowerCase().trim();

  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dmy) {
    const d = Number(dmy[1]);
    const mo = Number(dmy[2]) - 1;
    let y = dmy[3] ? Number(dmy[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) return new Date(y, mo, d);
  }

  const textual = t.match(/\b(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de\s+(\d{4}))?/);
  if (textual && MESES[textual[2]] !== undefined) {
    const d = Number(textual[1]);
    const mo = MESES[textual[2]];
    const y = textual[3] ? Number(textual[3]) : now.getFullYear();
    return new Date(y, mo, d);
  }

  return null;
}

// ---- Carga de estado desde la bitácora ----
async function loadSnapshots(): Promise<ItemSnapshot[]> {
  // Última actividad REAL por referencia = último análisis de un agente de
  // negocio (nueva llamada, formulario o re-enriquecimiento del lead). Los logs
  // de plomería (orchestrator/writer/NBA) se excluyen: siempre acompañan al
  // análisis unos segundos después y hacían que "la llamada es la última
  // actividad" nunca se cumpliera.
  const activity = await db.query<{ reference: string; last_ts: string }>(
    `SELECT reference, MAX(timestamp) as last_ts
       FROM logs
      WHERE reference IS NOT NULL
        AND agent_id IN ('lead_enrichment','form_analysis','call_intelligence')
      GROUP BY reference`
  );
  const lastActivity = new Map(activity.map((a) => [a.reference, a.last_ts]));

  // Todos los análisis de lead/llamada, en orden, para quedarnos con el más reciente.
  const rows = await db.query<LogRow>(
    `SELECT reference, agent_id, payload, timestamp
       FROM logs
      WHERE agent_id IN ('lead_enrichment','call_intelligence')
        AND payload IS NOT NULL AND reference IS NOT NULL
      ORDER BY timestamp ASC, id ASC`
  );

  const byRef = new Map<string, ItemSnapshot>();
  for (const r of rows) {
    let snap = byRef.get(r.reference);
    if (!snap) {
      const { itemId, itemName } = parseReference(r.reference);
      snap = {
        reference: r.reference,
        itemId,
        itemName,
        lead: null,
        call: null,
        callTs: null,
        lastActivityTs: lastActivity.get(r.reference) ?? null
      };
      byRef.set(r.reference, snap);
    }
    if (r.agent_id === "lead_enrichment") {
      const p = safeParseJson<LeadEnrichmentOutput>(r.payload);
      if (p) snap.lead = p; // el orden ASC garantiza que el último gana
    } else if (r.agent_id === "call_intelligence") {
      const p = safeParseJson<CallIntelligenceOutput>(r.payload);
      if (p) {
        snap.call = p;
        snap.callTs = r.timestamp;
      }
    }
  }
  return [...byRef.values()];
}

function telOf(snap: ItemSnapshot): string | null {
  return snap.call?.telefono ?? (snap.lead as { telefono?: string | null } | null)?.telefono ?? null;
}

function nombreCliente(itemName: string): string {
  return itemName.replace(/^(Llamada|Lead Web)\s*[—–-]\s*/i, "").trim() || itemName;
}

// ---- Reglas de negocio (cada una puede producir una acción) ----
function evaluarItem(snap: ItemSnapshot, now: Date): NextBestAction[] {
  const out: NextBestAction[] = [];
  const horas = hoursBetween(snap.lastActivityTs, now);
  const tel = telOf(snap);
  const cliente = nombreCliente(snap.itemName);
  const base = {
    itemId: snap.itemId,
    itemName: snap.itemName,
    reference: snap.reference,
    telefono: tel,
    horasSinActividad: Number.isFinite(horas) ? Math.round(horas) : undefined
  };

  // 1) Compromisos de la última llamada sin seguimiento posterior.
  //    "sin seguimiento" = la última actividad real es la propia llamada.
  const compromisos = snap.call?.compromisos ?? [];
  const llamadaEsUltimaActividad =
    snap.callTs != null && snap.callTs === snap.lastActivityTs && horas >= H_COMPROMISO;
  if (compromisos.length && llamadaEsUltimaActividad) {
    for (const c of compromisos) {
      const fecha = parseFechaCompromiso(c.fecha, now);
      const vencido = fecha != null && fecha.getTime() < now.getTime();
      const tipo: NextBestActionType = vencido ? "compromiso_vencido" : "compromiso_sin_seguimiento";
      out.push({
        ...base,
        tipo,
        prioridad: vencido ? "alta" : "media",
        fechaReferencia: c.fecha ?? null,
        motivo: vencido
          ? `Compromiso vencido${c.fecha ? ` (${c.fecha})` : ""} sin cerrar: "${c.descripcion}".`
          : `Compromiso pactado en la última llamada sin seguimiento (${Math.round(horas)}h): "${c.descripcion}".`,
        accionSugerida: vencido
          ? `Contactar HOY a ${cliente}${tel ? ` (${tel})` : ""} y cerrar o replantear: "${c.descripcion}".`
          : `Dar seguimiento a ${cliente}${tel ? ` (${tel})` : ""} sobre "${c.descripcion}" (resp. ${c.responsable}${c.fecha ? `, ${c.fecha}` : ""}).`
      });
    }
  }

  // 2) Llamada con señales de riesgo (banderas rojas o baja probabilidad).
  const banderas = snap.call?.analisisProfundo?.banderasRojas ?? [];
  const enRiesgo =
    snap.call != null &&
    (banderas.length > 0 || (snap.call.probabilidadCierre === "baja" && snap.call.sentimiento === "negativo"));
  if (enRiesgo && llamadaEsUltimaActividad) {
    out.push({
      ...base,
      tipo: "llamada_requiere_atencion",
      prioridad: banderas.length ? "alta" : "media",
      fechaReferencia: snap.callTs,
      motivo: banderas.length
        ? `Banderas rojas en la última llamada: ${banderas.slice(0, 3).join("; ")}.`
        : `Última llamada con baja probabilidad de cierre y sentimiento negativo.`,
      accionSugerida: `Revisar la llamada de ${cliente} y diseñar plan de recuperación${
        snap.call?.integrado?.proximaLlamada ? `: ${snap.call.integrado.proximaLlamada}` : "."
      }`
    });
  }

  // 3) Lead caliente/tibio enfriándose por falta de actividad.
  const prio = snap.lead?.prioridad;
  if (prio === "caliente" && horas >= H_CALIENTE) {
    out.push({
      ...base,
      tipo: "lead_caliente_sin_seguimiento",
      prioridad: "alta",
      fechaReferencia: snap.lastActivityTs,
      motivo: `Lead CALIENTE (score ${snap.lead?.score ?? "?"}) sin actividad en ${Math.round(horas)}h.`,
      accionSugerida: `Llamar ya a ${cliente}${tel ? ` (${tel})` : ""}: ${
        snap.lead?.accionRecomendada || "confirmar necesidad y avanzar a cotización."
      }`
    });
  } else if (prio === "tibia" && horas >= H_TIBIA) {
    out.push({
      ...base,
      tipo: "lead_tibio_sin_seguimiento",
      prioridad: "media",
      fechaReferencia: snap.lastActivityTs,
      motivo: `Lead tibio (score ${snap.lead?.score ?? "?"}) enfriándose: ${Math.round(horas)}h sin actividad.`,
      accionSugerida: `Reactivar a ${cliente}${tel ? ` (${tel})` : ""} con un toque de valor (caso de éxito o beneficio fiscal de renta).`
    });
  }

  return out;
}

export interface NextBestActionOptions {
  now?: Date;
  write?: boolean;   // escribir alertas en Monday (alta prioridad)
}

export async function runNextBestActionAgent(
  opts: NextBestActionOptions = {}
): Promise<NextBestActionReport> {
  const now = opts.now ?? new Date();
  const snapshots = await loadSnapshots();

  const acciones = snapshots
    .flatMap((s) => evaluarItem(s, now))
    .sort(
      (a, b) =>
        PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad] ||
        (b.horasSinActividad ?? 0) - (a.horasSinActividad ?? 0)
    );

  const porPrioridad = {
    alta: acciones.filter((a) => a.prioridad === "alta").length,
    media: acciones.filter((a) => a.prioridad === "media").length,
    baja: acciones.filter((a) => a.prioridad === "baja").length
  };

  // Escritura a Monday: por cada item con alguna alerta de alta prioridad,
  // marcamos la columna "requiere_atencion" y dejamos un comentario consolidado.
  let escrituraMonday = false;
  if (opts.write) {
    const porItem = new Map<string, NextBestAction[]>();
    for (const a of acciones.filter((x) => x.prioridad === "alta")) {
      const arr = porItem.get(a.reference) ?? [];
      arr.push(a);
      porItem.set(a.reference, arr);
    }
    for (const [reference, items] of porItem) {
      const first = items[0];
      const comment = [
        `🔔 Next Best Action — ${items.length} alerta(s) de seguimiento de alta prioridad:`,
        ...items.map((a) => `• [${a.tipo}] ${a.motivo}\n   → ${a.accionSugerida}`)
      ].join("\n");
      await runMondayWriterAgent({
        itemId: first.itemId,
        itemName: first.itemName,
        columnUpdates: { requiere_atencion: "Sí" },
        comment
      });
      await logActivity({
        agentId: AGENT_ID,
        type: "warning",
        title: `Seguimiento requerido: ${items.length} alerta(s)`,
        detail: items.map((a) => a.accionSugerida).join(" | "),
        reference,
        payload: items
      });
      escrituraMonday = true;
    }
  }

  await logActivity({
    agentId: AGENT_ID,
    type: acciones.length ? "info" : "success",
    title: acciones.length
      ? `Next Best Action: ${acciones.length} acción(es) (${porPrioridad.alta} alta)`
      : "Next Best Action: todo al día",
    detail: `Items revisados: ${snapshots.length}. Escritura en Monday: ${escrituraMonday ? "sí" : "no"}.`,
    payload: { porPrioridad, total: acciones.length }
  });

  return {
    generadoEn: now.toISOString(),
    totalAcciones: acciones.length,
    porPrioridad,
    itemsRevisados: snapshots.length,
    escrituraMonday,
    acciones
  };
}
