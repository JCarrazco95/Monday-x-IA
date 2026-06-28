import { Router } from "express";
import { db } from "../db/index.js";

export const leadsRouter = Router();

const SPECIALIST_AGENTS = ["lead_enrichment", "form_analysis", "call_intelligence"] as const;

/**
 * El análisis IA de cada lead no se guarda en una tabla propia: vive en la
 * bitácora (`logs`) como el `payload` que dejó cada agente especializado al
 * procesar el item de Monday. Aquí lo reconstruimos: tomamos el payload más
 * reciente de cada agente para una misma referencia (`#<itemId> · <nombre>`)
 * y lo combinamos en un objeto de "Análisis IA" listo para la vista.
 */

interface RefRow {
  reference: string;
  last_ts: string;
}

function parseReference(reference: string): { itemId: string; itemName: string } {
  const m = reference.match(/^#(\S+)\s*·\s*(.+)$/);
  return { itemId: m?.[1] ?? reference, itemName: m?.[2] ?? reference };
}

async function latestPayload<T = Record<string, unknown>>(
  reference: string,
  agentId: string
): Promise<T | null> {
  const row = await db.queryOne<{ payload: string }>(
    `SELECT payload, timestamp FROM logs
       WHERE reference = ? AND agent_id = ? AND payload IS NOT NULL
       ORDER BY timestamp DESC, id DESC LIMIT 1`,
    [reference, agentId]
  );
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

async function lastTimestamp(reference: string): Promise<string | null> {
  const row = await db.queryOne<{ ts: string | null }>(
    `SELECT MAX(timestamp) as ts FROM logs
       WHERE reference = ? AND agent_id IN ('lead_enrichment','form_analysis','call_intelligence')`,
    [reference]
  );
  return row?.ts ?? null;
}

interface AnyPayload {
  [k: string]: unknown;
}

async function buildAnalysis(reference: string) {
  const { itemId, itemName } = parseReference(reference);

  const [lead, form, call, updatedAt] = await Promise.all([
    latestPayload<AnyPayload>(reference, "lead_enrichment"),
    latestPayload<AnyPayload>(reference, "form_analysis"),
    latestPayload<AnyPayload>(reference, "call_intelligence"),
    lastTimestamp(reference)
  ]);

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

async function allReferences(): Promise<RefRow[]> {
  return db.query<RefRow>(
    `SELECT reference, MAX(timestamp) as last_ts
       FROM logs
       WHERE agent_id IN ('lead_enrichment','form_analysis','call_intelligence')
         AND reference IS NOT NULL
       GROUP BY reference
       ORDER BY last_ts DESC`
  );
}

// GET /api/leads  → resumen de todos los leads analizados + KPIs para el widget "Pipeline IA"
leadsRouter.get("/", async (_req, res) => {
  const refs = await allReferences();
  const analyses = await Promise.all(refs.map((r) => buildAnalysis(r.reference)));
  const leads = analyses.map(summaryFromAnalysis);

  const scored = leads.filter((l) => typeof l.score === "number");
  const today = new Date().toISOString().slice(0, 10);

  const stats = {
    analizadosHoy: refs.filter((r) => (r.last_ts ?? "").slice(0, 10) === today).length,
    total: leads.length,
    scorePromedio: scored.length
      ? Math.round(scored.reduce((s, l) => s + (l.score as number), 0) / scored.length)
      : 0,
    altoPotencial: scored.filter((l) => (l.score as number) >= 70).length,
    duplicados: leads.filter((l) => l.duplicado).length
  };

  res.json({ stats, leads });
});

// GET /api/leads/:itemId  → análisis IA completo de un lead
leadsRouter.get("/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const refs = await allReferences();
  const match = refs.find((r) => parseReference(r.reference).itemId === itemId);

  if (!match) {
    return res.status(404).json({ error: "Lead no encontrado o aun sin analisis IA" });
  }

  res.json(await buildAnalysis(match.reference));
});
