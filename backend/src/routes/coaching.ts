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
//  Identidad del vendedor: cada análisis guarda `vendedorNombre` (el user de Aircall
//  o el capturado a mano). Filtros por query: `?vendedor=<nombre>` acota todas
//  las métricas a ese vendedor; `?dias=<n>` acota al periodo reciente. Sin
//  filtros = equipo completo. Además se devuelve `vendedores` (los nombres
//  disponibles) y `ranking` (comparativa por vendedor) para la vista de gerente.
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
  // A.3: lee la tabla de dominio (una fila por llamada) en vez de agrupar logs.
  const rows = await db.query<{ payload: string; analyzed_at: string }>(
    `SELECT payload, analyzed_at FROM call_analyses`
  );
  const out: { call: CallIntelligenceOutput; ts: string }[] = [];
  for (const r of rows) {
    try {
      out.push({ call: JSON.parse(r.payload) as CallIntelligenceOutput, ts: r.analyzed_at });
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

// GET /api/coaching[?vendedor=&dias=]  → métricas de coaching (equipo o por vendedor).
coachingRouter.get("/", async (req, res) => {
  try {
    const vendedorFiltro = typeof req.query.vendedor === "string" && req.query.vendedor.trim()
      ? req.query.vendedor.trim()
      : null;
    const dias = Number(req.query.dias);
    const desde = Number.isFinite(dias) && dias > 0
      ? new Date(Date.now() - dias * 24 * 3_600_000).toISOString().slice(0, 10)
      : null;

    let todas = await latestCalls();
    if (desde) todas = todas.filter((c) => (c.ts ?? "") >= desde);

    // Coaching mide calidad de VENTA: los buzones/llamadas no evaluables
    // (score 0) se excluyen de todas las métricas para no hundir promedios.
    const evaluables = todas.filter((c) => (c.call.sandler?.puntajeFinal ?? 0) > 0);

    // Vendedores disponibles en el periodo (para el selector del frontend) y
    // ranking comparativo, SIEMPRE sobre el total evaluable (sin filtro de vendedor).
    const llamadasPorVendedor = new Map<string, { call: CallIntelligenceOutput; ts: string }[]>();
    for (const c of evaluables) {
      const key = c.call.vendedorNombre?.trim() || "Sin identificar";
      const arr = llamadasPorVendedor.get(key) ?? [];
      arr.push(c);
      llamadasPorVendedor.set(key, arr);
    }
    const vendedores = [...llamadasPorVendedor.keys()].filter((v) => v !== "Sin identificar").sort();
    const ranking = [...llamadasPorVendedor.entries()]
      .map(([vendedor, cs]) => {
        const globales = cs.map((c) => c.call.integrado?.scoreGlobal).filter((n): n is number => typeof n === "number");
        return {
          vendedor,
          llamadas: cs.length,
          sandlerProm: avg(cs.map((c) => c.call.sandler?.puntajeFinal).filter((n): n is number => typeof n === "number")),
          challengerProm: avg(cs.map((c) => c.call.challenger?.score).filter((n): n is number => typeof n === "number")),
          globalProm: avg(globales),
          verdes: globales.filter((s) => bandaFromScore(s) === "verde").length,
          rojas: globales.filter((s) => bandaFromScore(s) === "rojo").length
        };
      })
      .sort((a, b) => b.globalProm - a.globalProm);

    const calls = vendedorFiltro
      ? evaluables.filter((c) => (c.call.vendedorNombre?.trim() || "Sin identificar") === vendedorFiltro)
      : evaluables;
    const noEvaluables = todas.length - evaluables.length;

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

    // Desglose POR VENDEDOR (Aircall user.name propagado como vendedorNombre).
    // Las llamadas sin identidad se agrupan en "Sin identificar" — irán
    // desapareciendo conforme entren análisis nuevos con el dato.
    const porVendedorAgg = new Map<string, { sandler: number[]; challenger: number[]; global: number[]; etapas: Map<number, { nombre: string; puntajes: number[] }>; meses: Map<string, number[]> }>();
    for (const { call, ts } of calls) {
      const key = call.vendedorNombre?.trim() || "Sin identificar";
      const cur = porVendedorAgg.get(key) ?? {
        sandler: [] as number[],
        challenger: [] as number[],
        global: [] as number[],
        etapas: new Map<number, { nombre: string; puntajes: number[] }>(),
        meses: new Map<string, number[]>()
      };
      if (typeof call.sandler?.puntajeFinal === "number") cur.sandler.push(call.sandler.puntajeFinal);
      if (typeof call.challenger?.score === "number") cur.challenger.push(call.challenger.score);
      if (typeof call.integrado?.scoreGlobal === "number") cur.global.push(call.integrado.scoreGlobal);
      // C.2: tendencia mensual POR vendedor (score global; cae a Sandler si falta).
      const g = call.integrado?.scoreGlobal ?? call.sandler?.puntajeFinal;
      if (typeof g === "number") {
        const mk = monthKey(ts);
        const arr = cur.meses.get(mk) ?? [];
        arr.push(g);
        cur.meses.set(mk, arr);
      }
      for (const e of call.sandler?.etapas ?? []) {
        if (e.estado === "no_aplica") continue;
        const et = cur.etapas.get(e.id) ?? { nombre: e.nombre, puntajes: [] };
        et.puntajes.push(e.puntaje);
        cur.etapas.set(e.id, et);
      }
      porVendedorAgg.set(key, cur);
    }
    const porVendedor = [...porVendedorAgg.entries()]
      .map(([vendedor, v]) => {
        const etapas = [...v.etapas.entries()]
          .map(([id, e]) => ({ id, nombre: e.nombre, promedio: avg(e.puntajes) }))
          .sort((a, b) => a.id - b.id);
        const debil = etapas.length ? etapas.reduce((min, e) => (e.promedio < min.promedio ? e : min)) : null;
        // C.3 — insignias: etapas Sandler DOMINADAS (promedio en banda verde).
        const insignias = etapas.filter((e) => e.promedio >= 75).map((e) => e.nombre);
        return {
          vendedor,
          llamadas: v.sandler.length,
          sandlerProm: avg(v.sandler),
          challengerProm: avg(v.challenger),
          globalProm: avg(v.global),
          etapaMasDebil: debil ? { nombre: debil.nombre, promedio: debil.promedio } : null,
          etapas,
          insignias,
          tendencia: [...v.meses.entries()]
            .map(([periodo, scores]) => ({ periodo, globalProm: avg(scores), count: scores.length }))
            .sort((a, b) => a.periodo.localeCompare(b.periodo))
        };
      })
      // Ranking: score global > insignias > volumen de llamadas.
      .sort((a, b) => b.globalProm - a.globalProm || b.insignias.length - a.insignias.length || b.llamadas - a.llamadas)
      .map((v, i) => ({ ...v, posicion: i + 1 }));

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
      filtro: { vendedor: vendedorFiltro, dias: desde ? dias : null },
      vendedores,
      ranking,
      stats: {
        totalLlamadas: calls.length,
        noEvaluables,
        sandlerProm,
        challengerProm: avg(challengerScores),
        globalProm: avg(globalScores),
        verdes: globalScores.filter((s) => bandaFromScore(s) === "verde").length,
        rojas: globalScores.filter((s) => bandaFromScore(s) === "rojo").length
      },
      etapasSandler,
      etapaMasDebil,
      porVendedor,
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
