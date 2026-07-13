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
    comment: buildLeadComment(result)
  };
}

function buildLeadComment(result: import("./types.js").LeadEnrichmentOutput): string {
  const lines: string[] = [];
  lines.push(`🤖 Calificación de lead — Score ${result.score}/100 · prioridad ${result.prioridad} · riesgo ${result.riesgo}`);
  lines.push(result.resumen);
  if (result.scoreBreakdown?.length) {
    lines.push(`\n📊 Desglose del score:\n${result.scoreBreakdown.map((f) => `- ${f.factor}: ${f.puntos}/${f.max} — ${f.justificacion}`).join("\n")}`);
  }
  if (result.preguntasDiscovery?.length) lines.push(`\n❓ Preguntas para la 1a llamada:\n- ${result.preguntasDiscovery.join("\n- ")}`);
  if (result.siguientesPasos?.length) lines.push(`\n🧭 Siguientes pasos:\n- ${result.siguientesPasos.join("\n- ")}`);
  if (result.riesgosComerciales?.length) lines.push(`\n🚩 Riesgos a vigilar:\n- ${result.riesgosComerciales.join("\n- ")}`);
  const r = result.research;
  if (r) {
    if (r.sectores?.length) lines.push(`\n🏢 Sector(es): ${r.sectores.join(", ")}`);
    if (r.debilidades?.length) lines.push(`⚠️ Debilidades: ${r.debilidades.join("; ")}`);
    if (r.oportunidadesMaxirent?.length) lines.push(`✅ Qué le resolvemos: ${r.oportunidadesMaxirent.join("; ")}`);
    if (r.necesidadVehicular) lines.push(`🚚 Flota sugerida: ${r.necesidadVehicular}`);
    if (r.rentaOtrasMarcas?.detectado)
      lines.push(`🏁 Renta con competencia: ${r.rentaOtrasMarcas.detalle ?? (r.rentaOtrasMarcas.competidores ?? []).join(", ")}`);
    if (r.gobierno?.tieneContratos) lines.push(`🏛️ Gobierno/licitaciones: ${r.gobierno.detalle ?? "Sí"}`);
    if (r.argumentarioVenta?.length) lines.push(`\n💬 Argumentario:\n- ${r.argumentarioVenta.join("\n- ")}`);
    if (r.fuentes?.length) lines.push(`\n🔗 Fuentes:\n${r.fuentes.map((f) => `- ${f.titulo}: ${f.url}`).join("\n")}`);
    lines.push(`\n(confianza: ${r.confianza}${result.fuenteAnalisis ? ` · fuente: ${result.fuenteAnalisis}` : ""}${result.conocimientoPrevio ? " · con conocimiento previo" : ""})`);
  }
  lines.push(`\nAcción recomendada: ${result.accionRecomendada}`);
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
