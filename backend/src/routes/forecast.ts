import { Router } from "express";
import { db } from "../db/index.js";
import { parseReference, safeParseJson } from "../lib/references.js";
import type { LeadEnrichmentOutput, CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Forecast / Pipeline ponderado.
//
//  Combina el score/prioridad del lead con la probabilidad de cierre de la
//  llamada para estimar un PIPELINE PONDERADO POR PROBABILIDAD y un funnel.
//
//  IMPORTANTE — supuestos transparentes: no tenemos montos reales de contrato,
//  así que el "valor estimado" se deriva de un TICKET BASE configurable
//  (FORECAST_TICKET_BASE, MXN/mes) por un factor de tamaño según el score.
//  El número SIEMPRE se devuelve junto a `supuestos` para que sea auditable,
//  nunca como una cifra cerrada. Cuando exista el monto real (columna Monday o
//  cotización), se sustituye `valorEstimado` por ese dato.
// ===========================================================================

export const forecastRouter = Router();

const TICKET_BASE = Number(process.env.FORECAST_TICKET_BASE ?? 25000); // MXN/mes por oportunidad típica
const MONEDA = process.env.FORECAST_MONEDA ?? "MXN";

interface LogRow {
  reference: string;
  agent_id: string;
  payload: string | null;
  timestamp: string;
}

type Etapa = "Calificado" | "Cotización" | "Negociación" | "Cierre probable" | "Descartado";

interface Snapshot {
  itemId: string;
  itemName: string;
  lead: LeadEnrichmentOutput | null;
  form: Record<string, unknown> | null;
  call: CallIntelligenceOutput | null;
  lastTs: string | null;
}

async function loadSnapshots(): Promise<Snapshot[]> {
  const rows = await db.query<LogRow>(
    `SELECT reference, agent_id, payload, timestamp
       FROM logs
      WHERE agent_id IN ('lead_enrichment','form_analysis','call_intelligence')
        AND payload IS NOT NULL AND reference IS NOT NULL
      ORDER BY timestamp ASC, id ASC`
  );
  const byRef = new Map<string, Snapshot>();
  for (const r of rows) {
    let s = byRef.get(r.reference);
    if (!s) {
      const { itemId, itemName } = parseReference(r.reference);
      s = { itemId, itemName, lead: null, form: null, call: null, lastTs: null };
      byRef.set(r.reference, s);
    }
    s.lastTs = r.timestamp;
    if (r.agent_id === "lead_enrichment") s.lead = safeParseJson<LeadEnrichmentOutput>(r.payload) ?? s.lead;
    else if (r.agent_id === "form_analysis") s.form = safeParseJson<Record<string, unknown>>(r.payload) ?? s.form;
    else if (r.agent_id === "call_intelligence") s.call = safeParseJson<CallIntelligenceOutput>(r.payload) ?? s.call;
  }
  return [...byRef.values()];
}

function etapaDe(s: Snapshot): Etapa {
  if (s.lead?.duplicado) return "Descartado";
  if (s.call) {
    return s.call.probabilidadCierre === "alta" ? "Cierre probable" : "Negociación";
  }
  if (s.form) return "Cotización";
  return "Calificado";
}

// Probabilidad de cierre 0-1. Prioriza la señal de la llamada (más reciente y
// directa); si no hay llamada, usa la prioridad/score del lead.
function probabilidadDe(s: Snapshot): { p: number; fuente: "llamada" | "lead" | "default" } {
  if (s.call?.probabilidadCierre) {
    const map = { alta: 0.7, media: 0.4, baja: 0.15 } as const;
    return { p: map[s.call.probabilidadCierre], fuente: "llamada" };
  }
  if (s.lead?.prioridad) {
    const base = { caliente: 0.5, tibia: 0.28, fria: 0.1 }[s.lead.prioridad];
    // Ajuste fino por score (un caliente de 90 pesa más que uno de 76).
    const score = typeof s.lead.score === "number" ? s.lead.score : 50;
    const ajuste = Math.max(0.6, Math.min(1.3, score / 70));
    return { p: Math.max(0.05, Math.min(0.85, base * ajuste)), fuente: "lead" };
  }
  return { p: 0.2, fuente: "default" };
}

// Valor estimado (MXN/mes) a partir del ticket base por un factor de tamaño.
function valorEstimadoDe(s: Snapshot): number {
  const score = typeof s.lead?.score === "number" ? s.lead.score : 50;
  let factor = Math.max(0.5, Math.min(2.5, score / 50)); // 0.5x – 2.5x
  // Señales de mayor tamaño suben el factor.
  if (s.lead?.research?.gobierno?.tieneContratos) factor *= 1.25;
  const vehiculos = s.call?.vehiculosMencionados?.length ?? 0;
  if (vehiculos >= 2) factor *= 1.15;
  return Math.round((TICKET_BASE * factor) / 1000) * 1000;
}

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function monthLabel(d: Date): string {
  return `${MESES_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Mes de cierre proyectado: por probabilidad/etapa (alta=este mes, media=+1, baja=+2).
function mesCierreProyectado(p: number, now: Date): { key: string; label: string } {
  const offset = p >= 0.6 ? 0 : p >= 0.35 ? 1 : 2;
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { key: monthKey(d), label: monthLabel(d) };
}

// GET /api/forecast  → pipeline ponderado + funnel + proyección por mes.
forecastRouter.get("/", async (_req, res) => {
  try {
    const now = new Date();
    const snaps = (await loadSnapshots()).filter((s) => etapaDe(s) !== "Descartado");

    const oportunidades = snaps.map((s) => {
      const etapa = etapaDe(s);
      const { p, fuente } = probabilidadDe(s);
      const valorEstimado = valorEstimadoDe(s);
      const valorPonderado = Math.round(valorEstimado * p);
      const mes = mesCierreProyectado(p, now);
      return {
        itemId: s.itemId,
        itemName: s.itemName,
        etapa,
        prioridad: s.lead?.prioridad ?? null,
        probabilidad: Math.round(p * 100),
        probabilidadFuente: fuente,
        valorEstimado,
        valorPonderado,
        mesCierreKey: mes.key,
        mesCierre: mes.label
      };
    });

    const valorPipeline = oportunidades.reduce((s, o) => s + o.valorEstimado, 0);
    const valorPonderado = oportunidades.reduce((s, o) => s + o.valorPonderado, 0);

    // Funnel por etapa.
    const ORDEN: Etapa[] = ["Calificado", "Cotización", "Negociación", "Cierre probable"];
    const funnel = ORDEN.map((etapa) => {
      const items = oportunidades.filter((o) => o.etapa === etapa);
      return {
        etapa,
        count: items.length,
        valor: items.reduce((s, o) => s + o.valorEstimado, 0),
        valorPonderado: items.reduce((s, o) => s + o.valorPonderado, 0)
      };
    });

    // Proyección por mes (valor ponderado esperado).
    const mesMap = new Map<string, { mes: string; valorPonderado: number; valorBruto: number; count: number }>();
    for (const o of oportunidades) {
      const cur = mesMap.get(o.mesCierreKey) ?? { mes: o.mesCierre, valorPonderado: 0, valorBruto: 0, count: 0 };
      cur.valorPonderado += o.valorPonderado;
      cur.valorBruto += o.valorEstimado;
      cur.count += 1;
      mesMap.set(o.mesCierreKey, cur);
    }
    const porMes = [...mesMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);

    const topOportunidades = [...oportunidades]
      .sort((a, b) => b.valorPonderado - a.valorPonderado)
      .slice(0, 12);

    res.json({
      supuestos: {
        ticketBase: TICKET_BASE,
        moneda: MONEDA,
        nota:
          "Valor estimado = ticket base × factor de tamaño (por score). Probabilidad por llamada (alta/media/baja=70/40/15%) o por prioridad del lead. Sustituir por monto real de cotización cuando exista.",
        probabilidades: { llamada: { alta: 70, media: 40, baja: 15 }, lead: { caliente: 50, tibia: 28, fria: 10 } }
      },
      stats: {
        totalOportunidades: oportunidades.length,
        valorPipeline,
        valorPonderado,
        ticketPromedio: oportunidades.length ? Math.round(valorPipeline / oportunidades.length) : 0,
        probPromedio: oportunidades.length
          ? Math.round(oportunidades.reduce((s, o) => s + o.probabilidad, 0) / oportunidades.length)
          : 0
      },
      funnel,
      porMes,
      topOportunidades
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
