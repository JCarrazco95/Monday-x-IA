import { db } from "../db/index.js";
import { saveCallAnalysis, saveLeadAnalysis, saveFormAnalysis } from "../db/domain.js";
import { logActivity } from "../lib/activityLog.js";
import { formatReference } from "../lib/references.js";
import { runFormAnalysisAgent, AGENT_ID as FORM_AGENT } from "./formAnalysisAgent.js";
import { runLeadEnrichmentAgent, AGENT_ID as LEAD_AGENT } from "./leadEnrichmentAgent.js";
import { runCallIntelligenceAgent, AGENT_ID as CALL_AGENT } from "./callIntelligenceAgent.js";
import { runMondayWriterAgent, AGENT_ID as WRITER_AGENT } from "./mondayWriterAgent.js";
import type {
  OrchestratorEvent,
  FormAnalysisInput,
  LeadEnrichmentInput,
  CallIntelligenceInput,
  MondayWriteInput
} from "./types.js";

export const AGENT_ID = "orchestrator";

interface AgentRow {
  id: string;
  status: "active" | "paused" | "error";
}

async function getAgentStatus(agentId: string): Promise<"active" | "paused" | "error"> {
  const row = await db.queryOne<AgentRow>("SELECT status FROM agents WHERE id = ?", [agentId]);
  return row?.status ?? "paused";
}

/**
 * Punto único de entrada del sistema. Recibe un evento (de un webhook de
 * Monday/Make), decide qué agente especializado lo debe procesar, ejecuta
 * ese agente, traduce su resultado a actualizaciones de Monday y delega
 * la escritura al Monday Writer Agent. Cada paso queda registrado en la
 * bitácora para auditoría completa.
 */
export async function handleOrchestratorEvent(event: OrchestratorEvent) {
  const start = Date.now();

  logActivity({
    agentId: AGENT_ID,
    type: "info",
    title: `Evento recibido: ${event.eventType}`,
    detail: `Item: ${event.item.itemName} (#${event.item.itemId})`,
    reference: formatReference(event.item.itemId, event.item.itemName),
    payload: event
  });

  if ((await getAgentStatus(AGENT_ID)) !== "active") {
    logActivity({
      agentId: AGENT_ID,
      type: "warning",
      title: "Orquestador pausado — evento ignorado",
      reference: formatReference(event.item.itemId, event.item.itemName)
    });
    return { skipped: true, reason: "orchestrator_paused" };
  }

  let writeInput: MondayWriteInput;

  switch (event.eventType) {
    case "form_submitted":
      writeInput = await processFormSubmitted(event);
      break;
    case "lead_created":
      writeInput = await processLeadCreated(event);
      break;
    case "call_recorded":
      writeInput = await processCallRecorded(event);
      break;
    default:
      throw new Error(`Tipo de evento no soportado: ${event.eventType}`);
  }

  let writeResult = null;
  if ((await getAgentStatus(WRITER_AGENT)) === "active") {
    const writeStart = Date.now();
    writeResult = await runMondayWriterAgent(writeInput);
    logActivity({
      agentId: WRITER_AGENT,
      type: "success",
      title: isMockNote("Resultados escritos en Monday"),
      detail: `Columnas: ${writeResult.columnsUpdated.join(", ") || "ninguna"} · Subitems creados: ${writeResult.subitemsCreated} · Comentario: ${writeResult.commentPosted ? "sí" : "no"}`,
      reference: formatReference(event.item.itemId, event.item.itemName),
      payload: writeInput,
      durationMs: Date.now() - writeStart
    });
  } else {
    logActivity({
      agentId: WRITER_AGENT,
      type: "warning",
      title: "Monday Writer pausado — cambios no aplicados",
      reference: formatReference(event.item.itemId, event.item.itemName),
      payload: writeInput
    });
  }

  logActivity({
    agentId: AGENT_ID,
    type: "success",
    title: `Evento procesado: ${event.eventType}`,
    reference: formatReference(event.item.itemId, event.item.itemName),
    durationMs: Date.now() - start
  });

  return { skipped: false, writeInput, writeResult };
}

function isMockNote(title: string) {
  return process.env.MONDAY_API_TOKEN ? title : `${title} (modo demo, sin token)`;
}

// ---------------- Handlers por tipo de evento ----------------

async function processFormSubmitted(event: OrchestratorEvent): Promise<MondayWriteInput> {
  const input: FormAnalysisInput = {
    itemId: event.item.itemId,
    itemName: event.item.itemName,
    formResponses: (event.payload.formResponses as Record<string, string>) ?? {}
  };

  if ((await getAgentStatus(FORM_AGENT)) !== "active") {
    logActivity({
      agentId: FORM_AGENT,
      type: "warning",
      title: "Agente pausado — formulario no analizado",
      reference: formatReference(event.item.itemId, event.item.itemName)
    });
    return { itemId: input.itemId, itemName: input.itemName };
  }

  const start = Date.now();
  const result = await runFormAnalysisAgent(input);

  logActivity({
    agentId: FORM_AGENT,
    type: "success",
    title: "Formulario analizado",
    detail: result.resumen,
    reference: formatReference(event.item.itemId, event.item.itemName),
    payload: result,
    durationMs: Date.now() - start
  });

  // Write-through a la tabla de dominio (A.3 fase 2). Nunca rompe el flujo.
  try {
    await saveFormAnalysis(input.itemId, input.itemName, result);
  } catch (err) {
    console.error("[domain] no se pudo guardar form en lead_analyses:", err instanceof Error ? err.message : err);
  }

  return {
    itemId: input.itemId,
    itemName: input.itemName,
    // Claves FIJAS y deterministas (no las que invente la IA en columnasMonday),
    // para que el mapeo a columnas reales de Monday sea estable y sin errores.
    columnUpdates: {
      vehiculo_interes: result.vehiculoInteres,
      duracion_renta: result.duracionRenta,
      tipo_cliente: result.tipoCliente,
      urgencia: result.urgencia,
      disponible_en_flota: result.disponibleEnFlota ? "Sí" : "No"
    },
    comment: `🤖 Análisis de formulario:\n${result.resumen}\n\nPlantilla sugerida:\n${result.plantillaRespuesta}`
  };
}

// Guard de idempotencia para "lead_created": el mismo item puede llegar por
// más de un camino casi al mismo tiempo (Prospección crea el item Y dispara el
// evento directo; Monday detecta la creación Y llama al webhook) o repetido
// (Monday reintenta la entrega del webhook si no responde rápido). Sin esto,
// cada llegada relanzaba el análisis completo con IA desde cero y el ÚLTIMO en
// terminar ganaba el guardado — pisando un análisis con datos ricos (ej. de
// Prospección: razón social, sitio web) con uno pobre derivado de columnas de
// Monday vacías. `leadCreatedInFlight` cubre la carrera entre llamadas
// concurrentes; el check en `lead_analyses` cubre reintentos ya completados.
const leadCreatedInFlight = new Set<string>();

async function processLeadCreated(event: OrchestratorEvent): Promise<MondayWriteInput> {
  const p = event.payload as Record<string, string>;
  const input: LeadEnrichmentInput = {
    itemId: event.item.itemId,
    itemName: event.item.itemName,
    nombre: p.nombre ?? event.item.itemName,
    email: p.email,
    telefono: p.telefono,
    razonSocial: p.razonSocial,
    rfc: p.rfc
  };

  if (leadCreatedInFlight.has(input.itemId)) {
    logActivity({
      agentId: LEAD_AGENT,
      type: "warning",
      title: "Lead ya en proceso — evento duplicado ignorado",
      reference: formatReference(event.item.itemId, event.item.itemName)
    });
    return { itemId: input.itemId, itemName: input.itemName };
  }
  const yaAnalizado = await db.queryOne<{ item_id: string }>(
    `SELECT item_id FROM lead_analyses WHERE item_id = ?`,
    [input.itemId]
  );
  if (yaAnalizado) {
    logActivity({
      agentId: LEAD_AGENT,
      type: "info",
      title: "Lead ya analizado — evento repetido ignorado (posible reintento del webhook)",
      reference: formatReference(event.item.itemId, event.item.itemName)
    });
    return { itemId: input.itemId, itemName: input.itemName };
  }

  leadCreatedInFlight.add(input.itemId);
  try {
    if ((await getAgentStatus(LEAD_AGENT)) !== "active") {
      logActivity({
        agentId: LEAD_AGENT,
        type: "warning",
        title: "Agente pausado — lead no calificado",
        reference: formatReference(event.item.itemId, event.item.itemName)
      });
      return { itemId: input.itemId, itemName: input.itemName };
    }

    const start = Date.now();
    const result = await runLeadEnrichmentAgent(input);

    logActivity({
      agentId: LEAD_AGENT,
      type: result.duplicado ? "warning" : "success",
      title: result.duplicado ? "Lead duplicado detectado" : "Lead calificado",
      detail: result.resumen + (result.duplicado ? ` · Duplicado de ${result.duplicadoRef}` : ""),
      reference: formatReference(event.item.itemId, event.item.itemName),
      payload: { ...result, email: input.email, rfc: input.rfc, telefono: input.telefono, razonSocial: input.razonSocial },
      durationMs: Date.now() - start
    });

    // Write-through a la tabla de dominio (A.3 fase 2). Nunca rompe el flujo.
    try {
      await saveLeadAnalysis(input.itemId, input.itemName, result, {
        email: input.email,
        telefono: input.telefono,
        rfc: input.rfc,
        razonSocial: input.razonSocial
      });
    } catch (err) {
      console.error("[domain] no se pudo guardar lead_analyses:", err instanceof Error ? err.message : err);
    }

    const r = result.research;
    const columnUpdates: Record<string, unknown> = {
      score_lead: result.score,
      prioridad: result.prioridad,
      riesgo: result.riesgo,
      perfil_empresa: result.perfilEmpresa,
      accion_recomendada: result.accionRecomendada,
      posible_duplicado: result.duplicado ? "Sí" : "No"
    };
    if (r) {
      columnUpdates.sectores = r.sectores.join(", ");
      columnUpdates.renta_competencia = r.rentaOtrasMarcas.detectado ? "Sí" : "No";
      columnUpdates.contratos_gobierno = r.gobierno.tieneContratos ? "Sí" : "No";
      if (r.necesidadVehicular) columnUpdates.necesidad_vehicular = r.necesidadVehicular;
    }

    return {
      itemId: input.itemId,
      itemName: input.itemName,
      columnUpdates,
      comment: buildLeadComment(result, input)
    };
  } finally {
    leadCreatedInFlight.delete(input.itemId);
  }
}

/**
 * Resumen EJECUTIVO para el comentario de Monday (aparece en "Actualizaciones").
 * El análisis completo (desglose, playbook, preguntas de descubrimiento,
 * investigación a fondo de la empresa, fuentes) vive en la pestaña Análisis IA
 * del panel — este comentario apunta ahí en vez de duplicar todo el contenido.
 */
function buildLeadComment(
  result: import("./types.js").LeadEnrichmentOutput,
  input: LeadEnrichmentInput
): string {
  const lines: string[] = [];
  const empresa = input.razonSocial ? input.razonSocial : "Sin razón social (persona física)";
  lines.push(`🤖 Calificación de lead — Score ${result.score}/100 · prioridad ${result.prioridad} · riesgo ${result.riesgo}`);
  lines.push(`🏢 ${empresa}`);
  lines.push(result.resumen);

  const r = result.research;
  if (r?.sectores?.length) lines.push(`Sector(es): ${r.sectores.join(", ")}`);
  if (r?.necesidadVehicular) lines.push(`🚚 Flota sugerida: ${r.necesidadVehicular}`);

  lines.push(`\n⚡ Acción recomendada: ${result.accionRecomendada}`);
  lines.push(`\n📋 Análisis completo de ${empresa} (desglose del score, playbook de venta, preguntas de descubrimiento, investigación a fondo de la empresa y fuentes) en la pestaña **Análisis IA** del panel MAXIRent.`);
  return lines.join("\n");
}

async function processCallRecorded(event: OrchestratorEvent): Promise<MondayWriteInput> {
  const input: CallIntelligenceInput = {
    itemId: event.item.itemId,
    itemName: event.item.itemName,
    transcript: (event.payload.transcript as string) ?? "",
    audioUrl: event.payload.audioUrl as string | undefined,
    telefono: (event.payload.telefono as string | undefined) ?? null,
    vendedor: (event.payload.vendedor as string | undefined) ?? null
  };

  if ((await getAgentStatus(CALL_AGENT)) !== "active") {
    logActivity({
      agentId: CALL_AGENT,
      type: "warning",
      title: "Agente pausado — llamada no analizada",
      reference: formatReference(event.item.itemId, event.item.itemName)
    });
    return { itemId: input.itemId, itemName: input.itemName };
  }

  const start = Date.now();
  const result = await runCallIntelligenceAgent(input);

  logActivity({
    agentId: CALL_AGENT,
    type: "success",
    title: "Llamada analizada",
    detail: result.resumen,
    reference: formatReference(event.item.itemId, event.item.itemName),
    payload: result,
    durationMs: Date.now() - start
  });

  // Write-through a la tabla de dominio (A.3): las lecturas de Call
  // Intelligence salen de aquí, no de reconstruir logs. Nunca rompe el flujo.
  try {
    await saveCallAnalysis(input.itemId, input.itemName, result);
  } catch (err) {
    console.error("[domain] no se pudo guardar call_analyses:", err instanceof Error ? err.message : err);
  }

  const op = result.oportunidades;
  const columnUpdates: Record<string, unknown> = {
    sentimiento_llamada: result.sentimiento,
    probabilidad_cierre: result.probabilidadCierre,
    vehiculos_mencionados: result.vehiculosMencionados.join(", "),
    objeciones: result.objeciones.join("; ")
  };
  if (op) {
    columnUpdates.oportunidad_upsell = op.hayOportunidad ? "Sí" : "No";
    if (op.hayOportunidad) {
      columnUpdates.tipo_oportunidad = [...new Set(op.senales.map((s) => s.tipo))].join(", ");
    }
  }

  let comment = `🤖 Análisis de llamada:\n${result.resumen}\n\nSentimiento: ${result.sentimiento} · Probabilidad de cierre: ${result.probabilidadCierre}`;
  if (op?.hayOportunidad) {
    comment +=
      `\n\n💰 Oportunidad de crecimiento${op.ingresoIncrementalEstimado ? ` (${op.ingresoIncrementalEstimado})` : ""}:\n` +
      op.senales.map((s) => `• [${s.tipo} · ${s.potencial}] ${s.descripcion} → ${s.accionSugerida}`).join("\n");
  }

  return {
    itemId: input.itemId,
    itemName: input.itemName,
    columnUpdates,
    subitems: result.compromisos.map((c) => ({
      name: `${c.descripcion} (${c.responsable}${c.fecha ? " · " + c.fecha : ""})`
    })),
    comment
  };
}
