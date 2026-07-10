import { Router } from "express";
import { db } from "../db/index.js";
import { safeParseJson } from "../lib/references.js";
import {
  forecastMondayEnabled,
  getDealsBoard,
  getObjetivosMensuales,
  type DealRow,
  type EtapaDeal
} from "../lib/mondayForecast.js";
import type { LeadEnrichmentOutput, CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Forecast / Pipeline.
//
//  MODO LIVE (con MONDAY_API_TOKEN + MONDAY_BOARD_ID_OPORTUNIDADES): lee el
//  board real de Oportunidades (solo lectura) y arma el pipeline con montos y
//  etapas REALES. La probabilidad por etapa es el único supuesto (visible y
//  configurable con FORECAST_PROB_ETAPAS). Si Monday falla, responde error —
//  nunca sustituye datos reales por estimaciones sin avisar.
//
//  MODO DEMO (sin token): conserva la estimación anterior desde la bitácora
//  (`FORECAST_TICKET_BASE × factor(score)`), siempre con `supuestos`.
//  La respuesta declara su origen en `fuente: "monday" | "estimado"`.
// ===========================================================================

export const forecastRouter = Router();

const TICKET_BASE = Number(process.env.FORECAST_TICKET_BASE ?? 25000); // MXN/mes por oportunidad típica
const MONEDA = process.env.FORECAST_MONEDA ?? "MXN";

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function monthLabel(d: Date): string {
  return `${MESES_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ───────────────────────────── MODO LIVE (Monday) ─────────────────────────────

// Probabilidad de cierre por etapa (en %, sobreescribible por entorno).
const PROB_ETAPA_DEFAULT: Record<string, number> = {
  "Requiere seguimiento": 20,
  "Cotización enviada": 30,
  "Negociando": 60,
  "Documentación": 85,
  "Sin etapa": 20
};
function probEtapas(): Record<string, number> {
  const raw = process.env.FORECAST_PROB_ETAPAS;
  if (!raw) return PROB_ETAPA_DEFAULT;
  try {
    return { ...PROB_ETAPA_DEFAULT, ...(JSON.parse(raw) as Record<string, number>) };
  } catch {
    return PROB_ETAPA_DEFAULT;
  }
}

const MES_LARGO: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

/** Mes de cierre proyectado de un deal abierto: fecha estimada > etiqueta "Mes de cierre" > null. */
function mesCierreDe(d: DealRow): Date | null {
  if (d.fechaCierreEstimada) {
    const t = Date.parse(d.fechaCierreEstimada);
    if (!Number.isNaN(t)) return new Date(t);
  }
  const m = d.mesCierreLabel?.toLowerCase().match(/([a-záéíóú]+)\s+(\d{4})/);
  if (m && MES_LARGO[m[1]] !== undefined) return new Date(Number(m[2]), MES_LARGO[m[1]], 1);
  return null;
}

async function buildForecastFromMonday(now: Date) {
  const deals = await getDealsBoard();
  const probs = probEtapas();

  const abiertos = deals.filter((d) => d.etapa !== "Ganado" && d.etapa !== "Perdido");
  const ganados = deals.filter((d) => d.etapa === "Ganado");

  const oportunidades = abiertos.map((d) => {
    const probabilidad = probs[d.etapa] ?? 20;
    const valorEstimado = d.valor ?? 0;
    const valorPonderado = Math.round((valorEstimado * probabilidad) / 100);
    const mesDate = mesCierreDe(d);
    return {
      itemId: d.itemId,
      itemName: d.itemName,
      empresa: d.empresa,
      ejecutivo: d.ejecutivo,
      etapa: d.etapa as string,
      prioridad: null as null,
      probabilidad,
      probabilidadFuente: "etapa" as const,
      valorEstimado,
      valorPonderado,
      sinMonto: d.valor == null,
      mesCierreKey: mesDate ? monthKey(mesDate) : "sin-fecha",
      mesCierre: mesDate ? monthLabel(mesDate) : "Sin fecha"
    };
  });

  const conMonto = oportunidades.filter((o) => !o.sinMonto);
  const valorPipeline = conMonto.reduce((s, o) => s + o.valorEstimado, 0);
  const valorPonderado = conMonto.reduce((s, o) => s + o.valorPonderado, 0);

  // Funnel por etapa real del board.
  const ORDEN: EtapaDeal[] = ["Requiere seguimiento", "Cotización enviada", "Negociando", "Documentación"];
  const funnel = ORDEN.map((etapa) => {
    const items = oportunidades.filter((o) => o.etapa === etapa);
    return {
      etapa: etapa as string,
      count: items.length,
      valor: items.reduce((s, o) => s + o.valorEstimado, 0),
      valorPonderado: items.reduce((s, o) => s + o.valorPonderado, 0)
    };
  });
  const sinEtapa = oportunidades.filter((o) => o.etapa === "Sin etapa");
  if (sinEtapa.length) {
    funnel.push({
      etapa: "Sin etapa",
      count: sinEtapa.length,
      valor: sinEtapa.reduce((s, o) => s + o.valorEstimado, 0),
      valorPonderado: sinEtapa.reduce((s, o) => s + o.valorPonderado, 0)
    });
  }

  // Proyección por mes de cierre (esperado) + objetivo mensual si es legible.
  const objetivos = await getObjetivosMensuales(now.getFullYear());
  const objetivoPorMes = new Map(objetivos.porMes.map((o) => [o.mesKey, o.objetivo]));
  const mesMap = new Map<string, { mes: string; valorPonderado: number; valorBruto: number; count: number; objetivo: number | null }>();
  for (const o of oportunidades) {
    const cur = mesMap.get(o.mesCierreKey) ?? {
      mes: o.mesCierre,
      valorPonderado: 0,
      valorBruto: 0,
      count: 0,
      objetivo: objetivoPorMes.get(o.mesCierreKey) ?? null
    };
    cur.valorPonderado += o.valorPonderado;
    cur.valorBruto += o.valorEstimado;
    cur.count += 1;
    mesMap.set(o.mesCierreKey, cur);
  }
  const porMes = [...mesMap.entries()]
    .sort((a, b) => (a[0] === "sin-fecha" ? 1 : b[0] === "sin-fecha" ? -1 : a[0].localeCompare(b[0])))
    .map(([, v]) => v);

  // Ganado real (este mes / este año) por fecha real de cierre.
  const mesActual = monthKey(now);
  const anioActual = String(now.getFullYear());
  const ganadoMes = ganados
    .filter((d) => (d.fechaCierreReal ?? "").startsWith(mesActual))
    .reduce((s, d) => s + (d.valor ?? 0), 0);
  const ganadoAnio = ganados
    .filter((d) => (d.fechaCierreReal ?? "").startsWith(anioActual))
    .reduce((s, d) => s + (d.valor ?? 0), 0);

  // Resumen por ejecutivo (deals abiertos).
  const ejecMap = new Map<string, { ejecutivo: string; count: number; valor: number; valorPonderado: number }>();
  for (const o of oportunidades) {
    const nombre = o.ejecutivo ?? "Sin asignar";
    const cur = ejecMap.get(nombre) ?? { ejecutivo: nombre, count: 0, valor: 0, valorPonderado: 0 };
    cur.count += 1;
    cur.valor += o.valorEstimado;
    cur.valorPonderado += o.valorPonderado;
    ejecMap.set(nombre, cur);
  }
  const porEjecutivo = [...ejecMap.values()].sort((a, b) => b.valorPonderado - a.valorPonderado);

  const topOportunidades = [...oportunidades]
    .sort((a, b) => b.valorPonderado - a.valorPonderado)
    .slice(0, 12);

  return {
    fuente: "monday" as const,
    supuestos: {
      moneda: MONEDA,
      nota:
        "Montos y etapas reales del board Oportunidades de Monday. Único supuesto: probabilidad de cierre por etapa (configurable). Los deals sin monto capturado cuentan en el funnel pero no suman al pipeline.",
      probabilidades: { etapa: probs }
    },
    stats: {
      totalOportunidades: oportunidades.length,
      valorPipeline,
      valorPonderado,
      ticketPromedio: conMonto.length ? Math.round(valorPipeline / conMonto.length) : 0,
      probPromedio: oportunidades.length
        ? Math.round(oportunidades.reduce((s, o) => s + o.probabilidad, 0) / oportunidades.length)
        : 0,
      sinMonto: oportunidades.length - conMonto.length,
      ganadoMes,
      ganadoAnio
    },
    funnel,
    porMes,
    porEjecutivo,
    objetivos: { disponible: objetivos.disponible, motivo: objetivos.motivo ?? null },
    topOportunidades
  };
}

// ──────────────────────── MODO DEMO (estimación por tablas de dominio) ────────────────────────

type Etapa = "Calificado" | "Cotización" | "Negociación" | "Cierre probable" | "Descartado";

interface Snapshot {
  itemId: string;
  itemName: string;
  lead: LeadEnrichmentOutput | null;
  form: Record<string, unknown> | null;
  call: CallIntelligenceOutput | null;
  lastTs: string | null;
}

// A.3 fase 3: se leen las tablas de dominio (lead_analyses + call_analyses) en
// vez de reconstruir desde `logs`. Cada lead (con su formulario) y cada llamada
// es un snapshot propio — equivalente al comportamiento anterior, porque lead y
// llamada tienen item_id distintos (lead vs. aircall-*).
async function loadSnapshots(): Promise<Snapshot[]> {
  const out: Snapshot[] = [];

  const leads = await db.query<{ item_id: string; item_name: string; lead_payload: string | null; form_payload: string | null; analyzed_at: string }>(
    `SELECT item_id, item_name, lead_payload, form_payload, analyzed_at FROM lead_analyses`
  );
  for (const r of leads) {
    out.push({
      itemId: r.item_id,
      itemName: r.item_name,
      lead: safeParseJson<LeadEnrichmentOutput>(r.lead_payload),
      form: safeParseJson<Record<string, unknown>>(r.form_payload),
      call: null,
      lastTs: r.analyzed_at
    });
  }

  const calls = await db.query<{ item_id: string; item_name: string; payload: string; analyzed_at: string }>(
    `SELECT item_id, item_name, payload, analyzed_at FROM call_analyses`
  );
  for (const r of calls) {
    out.push({
      itemId: r.item_id,
      itemName: r.item_name,
      lead: null,
      form: null,
      call: safeParseJson<CallIntelligenceOutput>(r.payload),
      lastTs: r.analyzed_at
    });
  }

  return out;
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

// Mes de cierre proyectado: por probabilidad/etapa (alta=este mes, media=+1, baja=+2).
function mesCierreProyectado(p: number, now: Date): { key: string; label: string } {
  const offset = p >= 0.6 ? 0 : p >= 0.35 ? 1 : 2;
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { key: monthKey(d), label: monthLabel(d) };
}

async function buildForecastEstimado(now: Date) {
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
      empresa: null as string | null,
      ejecutivo: null as string | null,
      etapa: etapa as string,
      prioridad: s.lead?.prioridad ?? null,
      probabilidad: Math.round(p * 100),
      probabilidadFuente: fuente,
      valorEstimado,
      valorPonderado,
      sinMonto: false,
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
      etapa: etapa as string,
      count: items.length,
      valor: items.reduce((s, o) => s + o.valorEstimado, 0),
      valorPonderado: items.reduce((s, o) => s + o.valorPonderado, 0)
    };
  });

  // Proyección por mes (valor ponderado esperado).
  const mesMap = new Map<string, { mes: string; valorPonderado: number; valorBruto: number; count: number; objetivo: number | null }>();
  for (const o of oportunidades) {
    const cur = mesMap.get(o.mesCierreKey) ?? { mes: o.mesCierre, valorPonderado: 0, valorBruto: 0, count: 0, objetivo: null };
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

  return {
    fuente: "estimado" as const,
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
        : 0,
      sinMonto: 0,
      ganadoMes: null,
      ganadoAnio: null
    },
    funnel,
    porMes,
    porEjecutivo: [] as { ejecutivo: string; count: number; valor: number; valorPonderado: number }[],
    objetivos: { disponible: false, motivo: null as string | null },
    topOportunidades
  };
}

// GET /api/forecast → pipeline ponderado + funnel + proyección por mes.
forecastRouter.get("/", async (_req, res) => {
  const now = new Date();
  try {
    if (forecastMondayEnabled) {
      // Modo live estricto: si Monday falla, se reporta el error; nunca se
      // sustituyen los datos reales por una estimación sin avisar.
      res.json(await buildForecastFromMonday(now));
      return;
    }
    res.json(await buildForecastEstimado(now));
  } catch (err) {
    res.status(502).json({
      error: `No se pudo construir el forecast${forecastMondayEnabled ? " desde Monday" : ""}: ${
        err instanceof Error ? err.message : String(err)
      }`
    });
  }
});
