import { Router } from "express";
import { db } from "../db/index.js";
import type { CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Coaching del equipo — agregación sobre TODAS las llamadas analizadas.
//
//  Reconstruye el último análisis de cada llamada desde `logs` (call_intelligence)
//  y calcula métricas de coaching a nivel equipo: promedios Sandler/Challenger/
//  Global, la etapa Sandler más débil, distribución de perfiles del vendedor,
//  radar de habilidades, banderas rojas y objeciones recurrentes, y tendencia.
//
//  NOTA: hoy no se captura la identidad del vendedor por llamada, así que el
//  desglose es a nivel EQUIPO. Cuando el payload incluya `vendedor`, agrupar por
//  esa clave es trivial (ver `groupKey`).
// ===========================================================================

export const coachingRouter = Router();

type Banda = "rojo" | "amarillo" | "verde";

interface Row {
  reference: string;
  payload: string;
  timestamp: string;
}

function bandaFromScore(score: number): Banda {
  return score >= 75 ? "verde" : score >= 50 ? "amarillo" : "rojo";
}

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0;
}

// Cuenta frecuencias normalizando el texto (minúsculas, sin espacios extra),
// pero conserva la primera forma legible para mostrarla.
function topFrequencies(items: string[], limit = 8): { texto: string; count: number }[] {
  const map = new Map<string, { texto: string; count: number }>();
  for (const raw of items) {
    const texto = raw?.trim();
    if (!texto) continue;
    const key = texto.toLowerCase().replace(/\s+/g, " ");
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { texto, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

async function latestCalls(): Promise<{ call: CallIntelligenceOutput; ts: string }[]> {
  const rows = await db.query<Row>(
    `SELECT l.reference, l.payload, l.timestamp
       FROM logs l
       JOIN (
         SELECT reference, MAX(id) AS mid
           FROM logs
          WHERE agent_id = 'call_intelligence' AND payload IS NOT NULL AND reference IS NOT NULL
          GROUP BY reference
       ) m ON l.id = m.mid`
  );
  const out: { call: CallIntelligenceOutput; ts: string }[] = [];
  for (const r of rows) {
    try {
      out.push({ call: JSON.parse(r.payload) as CallIntelligenceOutput, ts: r.timestamp });
    } catch {
      /* payload corrupto: se ignora */
    }
  }
  return out;
}

function monthKey(ts: string): string {
  // ts es ISO o "YYYY-MM-DD HH:MM:SS"; tomamos YYYY-MM.
  return (ts || "").slice(0, 7);
}

// GET /api/coaching  → métricas de coaching del equipo.
coachingRouter.get("/", async (_req, res) => {
  try {
    const calls = await latestCalls();

    const sandlerScores = calls.map((c) => c.call.sandler?.puntajeFinal).filter((n): n is number => typeof n === "number");
    const challengerScores = calls.map((c) => c.call.challenger?.score).filter((n): n is number => typeof n === "number");
    const globalScores = calls.map((c) => c.call.integrado?.scoreGlobal).filter((n): n is number => typeof n === "number");

    // Etapas Sandler: promedio del equipo por etapa (ignora "no_aplica").
    const etapaAgg = new Map<number, { nombre: string; peso: number; puntajes: number[] }>();
    for (const { call } of calls) {
      for (const e of call.sandler?.etapas ?? []) {
        if (e.estado === "no_aplica") continue;
        const cur = etapaAgg.get(e.id) ?? { nombre: e.nombre, peso: e.peso, puntajes: [] };
        cur.puntajes.push(e.puntaje);
        etapaAgg.set(e.id, cur);
      }
    }
    const etapasSandler = [...etapaAgg.entries()]
      .map(([id, v]) => ({ id, nombre: v.nombre, peso: v.peso, promedio: avg(v.puntajes), muestras: v.puntajes.length }))
      .sort((a, b) => a.id - b.id);
    const etapaMasDebil = etapasSandler.length
      ? etapasSandler.reduce((min, e) => (e.promedio < min.promedio ? e : min))
      : null;

    // Distribución de perfil del vendedor (Challenger).
    const perfilCount = new Map<string, number>();
    for (const { call } of calls) {
      const p = call.challenger?.perfilVendedor;
      if (p) perfilCount.set(p, (perfilCount.get(p) ?? 0) + 1);
    }
    const totalPerfiles = [...perfilCount.values()].reduce((s, n) => s + n, 0) || 1;
    const perfilesVendedor = [...perfilCount.entries()]
      .map(([perfil, count]) => ({ perfil, count, pct: Math.round((count / totalPerfiles) * 100) }))
      .sort((a, b) => b.count - a.count);

    // Radar de habilidades del equipo (promedio por nombre de habilidad).
    const habAgg = new Map<string, number[]>();
    for (const { call } of calls) {
      for (const h of call.vendedor?.habilidades ?? []) {
        const arr = habAgg.get(h.nombre) ?? [];
        arr.push(h.puntaje);
        habAgg.set(h.nombre, arr);
      }
    }
    const habilidades = [...habAgg.entries()]
      .map(([nombre, puntajes]) => ({ nombre, promedio: avg(puntajes) }))
      .sort((a, b) => a.promedio - b.promedio);

    // Recurrencias: banderas rojas, objeciones y áreas de mejora.
    const banderasRojas = topFrequencies(calls.flatMap((c) => c.call.analisisProfundo?.banderasRojas ?? []));
    const objeciones = topFrequencies(calls.flatMap((c) => c.call.objeciones ?? []));
    const areasMejora = topFrequencies(
      calls.flatMap((c) => [
        ...(c.call.sandler?.areasMejora ?? []),
        ...((c.call.vendedor?.mejoras ?? []).map((m) => m.area))
      ])
    );

    // Tendencia mensual del score global.
    const trendAgg = new Map<string, number[]>();
    for (const { call, ts } of calls) {
      const g = call.integrado?.scoreGlobal ?? call.sandler?.puntajeFinal;
      if (typeof g !== "number") continue;
      const k = monthKey(ts);
      const arr = trendAgg.get(k) ?? [];
      arr.push(g);
      trendAgg.set(k, arr);
    }
    const tendencia = [...trendAgg.entries()]
      .map(([periodo, scores]) => ({ periodo, globalProm: avg(scores), count: scores.length }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    const sandlerProm = avg(sandlerScores);
    res.json({
      stats: {
        totalLlamadas: calls.length,
        sandlerProm,
        challengerProm: avg(challengerScores),
        globalProm: avg(globalScores),
        verdes: globalScores.filter((s) => bandaFromScore(s) === "verde").length,
        rojas: globalScores.filter((s) => bandaFromScore(s) === "rojo").length
      },
      etapasSandler,
      etapaMasDebil,
      perfilesVendedor,
      habilidades,
      banderasRojas,
      objeciones,
      areasMejora,
      tendencia
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
