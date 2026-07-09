import { Router } from "express";
import { db } from "../db/index.js";
import { safeParseJson } from "../lib/references.js";
import type { LeadAnalysisRow } from "../db/domain.js";

export const leadsRouter = Router();

/**
 * A.3 fase 2: el análisis IA de cada lead vive en la TABLA DE DOMINIO
 * `lead_analyses` (enriquecimiento + formulario) y su llamada más reciente en
 * `call_analyses` (mismo item_id). La bitácora (`logs`) queda como auditoría.
 */

interface AnyPayload {
  [k: string]: unknown;
}

async function buildAnalysis(row: LeadAnalysisRow) {
  const { item_id: itemId, item_name: itemName } = row;

  const lead = safeParseJson<AnyPayload>(row.lead_payload);
  const form = safeParseJson<AnyPayload>(row.form_payload);
  const callRow = await db.queryOne<{ payload: string }>(
    `SELECT payload FROM call_analyses WHERE item_id = ?`,
    [itemId]
  );
  const call = safeParseJson<AnyPayload>(callRow?.payload ?? null);
  const updatedAt = row.analyzed_at;

  const agents: string[] = [];
  if (lead) agents.push("Lead Enrichment Agent");
  if (form) agents.push("Form Analysis Agent");
  if (call) agents.push("Call Intelligence Agent");

  return {
    itemId,
    itemName,
    updatedAt,
    agents,
    lead: lead
      ? {
          score: Number(lead.score ?? 0),
          scoreBreakdown: Array.isArray(lead.scoreBreakdown) ? lead.scoreBreakdown : [],
          prioridad: lead.prioridad ?? null,
          riesgo: String(lead.riesgo ?? "medio"),
          perfilEmpresa: lead.perfilEmpresa ?? null,
          accionRecomendada: lead.accionRecomendada ?? null,
          siguientesPasos: Array.isArray(lead.siguientesPasos) ? lead.siguientesPasos : [],
          preguntasDiscovery: Array.isArray(lead.preguntasDiscovery) ? lead.preguntasDiscovery : [],
          riesgosComerciales: Array.isArray(lead.riesgosComerciales) ? lead.riesgosComerciales : [],
          duplicado: Boolean(lead.duplicado),
          duplicadoRef: lead.duplicadoRef ?? null,
          resumen: lead.resumen ?? null,
          email: lead.email ?? null,
          telefono: lead.telefono ?? null,
          rfc: lead.rfc ?? null,
          razonSocial: lead.razonSocial ?? null,
          research: lead.research ?? null,
          fuenteAnalisis: lead.fuenteAnalisis ?? null,
          conocimientoPrevio: Boolean(lead.conocimientoPrevio)
        }
      : null,
    form: form
      ? {
          vehiculoInteres: form.vehiculoInteres ?? null,
          duracionRenta: form.duracionRenta ?? null,
          tipoCliente: form.tipoCliente ?? null,
          urgencia: form.urgencia ?? null,
          disponibleEnFlota: Boolean(form.disponibleEnFlota),
          plantillaRespuesta: form.plantillaRespuesta ?? null,
          resumen: form.resumen ?? null
        }
      : null,
    call: call
      ? {
          sentimiento: call.sentimiento ?? null,
          probabilidadCierre: call.probabilidadCierre ?? null,
          vehiculosMencionados: Array.isArray(call.vehiculosMencionados) ? call.vehiculosMencionados : [],
          objeciones: Array.isArray(call.objeciones) ? call.objeciones : [],
          compromisos: Array.isArray(call.compromisos) ? call.compromisos : [],
          fechasMencionadas: Array.isArray(call.fechasMencionadas) ? call.fechasMencionadas : [],
          resumen: call.resumen ?? null,
          telefono: call.telefono ?? null,
          sandler: call.sandler ?? null,
          challenger: call.challenger ?? null,
          integrado: call.integrado ?? null,
          vendedor: call.vendedor ?? null,
          analisisProfundo: call.analisisProfundo ?? null,
          oportunidades: call.oportunidades ?? null
        }
      : null
  };
}

type Analysis = Awaited<ReturnType<typeof buildAnalysis>>;

function estadoFromAnalysis(a: Analysis): string {
  if (a.lead?.duplicado) return "Revisión manual";
  if (a.call) return "En negociación";
  if (a.form) return "Cotización enviada";
  return "En seguimiento";
}

function summaryFromAnalysis(a: Analysis) {
  return {
    itemId: a.itemId,
    itemName: a.itemName,
    score: a.lead?.score ?? null,
    prioridad: a.lead?.prioridad ?? null,
    riesgo: a.lead?.riesgo ?? null,
    duplicado: a.lead?.duplicado ?? false,
    sentimiento: a.call?.sentimiento ?? null,
    vehiculo: a.form?.vehiculoInteres ?? (a.call?.vehiculosMencionados?.[0] ?? null),
    estado: estadoFromAnalysis(a),
    updatedAt: a.updatedAt
  };
}

async function allLeadRows(): Promise<LeadAnalysisRow[]> {
  // Una fila por lead desde la tabla de dominio (las llamadas puras viven en
  // call_analyses y no aparecen aquí).
  return db.query<LeadAnalysisRow>(
    `SELECT item_id, item_name, score, prioridad, riesgo, duplicado, email,
            telefono, rfc, lead_payload, form_payload, analyzed_at
       FROM lead_analyses
      ORDER BY analyzed_at DESC, id DESC`
  );
}

// GET /api/leads  → resumen de todos los leads analizados + KPIs para el widget "Pipeline IA"
leadsRouter.get("/", async (_req, res) => {
  const rows = await allLeadRows();
  const analyses = await Promise.all(rows.map((r) => buildAnalysis(r)));
  const leads = analyses.map(summaryFromAnalysis);

  const scored = leads.filter((l) => typeof l.score === "number");
  const today = new Date().toISOString().slice(0, 10);

  const stats = {
    analizadosHoy: rows.filter((r) => (r.analyzed_at ?? "").slice(0, 10) === today).length,
    total: leads.length,
    scorePromedio: scored.length
      ? Math.round(scored.reduce((s, l) => s + (l.score as number), 0) / scored.length)
      : 0,
    altoPotencial: scored.filter((l) => (l.score as number) >= 70).length,
    duplicados: leads.filter((l) => l.duplicado).length
  };

  res.json({ stats, leads });
});

// GET /api/leads/:itemId  → análisis IA completo de un lead (lookup indexado)
leadsRouter.get("/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const row = await db.queryOne<LeadAnalysisRow>(
    `SELECT item_id, item_name, score, prioridad, riesgo, duplicado, email,
            telefono, rfc, lead_payload, form_payload, analyzed_at
       FROM lead_analyses WHERE item_id = ?`,
    [itemId]
  );

  if (!row) {
    return res.status(404).json({ error: "Lead no encontrado o aun sin analisis IA" });
  }

  res.json(await buildAnalysis(row));
});
