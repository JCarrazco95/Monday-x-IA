import { Router } from "express";
import { db } from "../db/index.js";
import { runNextBestActionAgent } from "../agents/nextBestActionAgent.js";
import { parseReference, safeParseJson } from "../lib/references.js";
import type { CallIntelligenceOutput, LeadEnrichmentOutput } from "../agents/types.js";

// ===========================================================================
//  C.7 — Reporte ejecutivo (semanal/mensual) para gerencia de ventas.
//
//  GET /api/reports/executive?dias=7  → resumen del período con:
//   llamadas analizadas y calidad (Sandler/Challenger/Global), desglose por
//   vendedor, etapa más débil del equipo, objeciones recurrentes, leads nuevos
//   y su calidad, oportunidades de upsell detectadas y alertas de seguimiento.
//
//  Devuelve datos estructurados + un `markdown` listo para pegar/enviar.
//  DETERMINISTA (sin IA): siempre disponible, sin costo de tokens. El envío
//  automático (cron + email) se agrega cuando haya credenciales de correo.
// ===========================================================================

export const reportsRouter = Router();

interface LogRow { reference: string; agent_id: string; payload: string; timestamp: string }

const avg = (ns: number[]) => (ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length) : 0);

function top<T>(map: Map<string, T[]>, limit: number): { texto: string; count: number }[] {
  return [...map.entries()]
    .map(([texto, arr]) => ({ texto, count: arr.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

reportsRouter.get("/executive", async (req, res) => {
  try {
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - dias * 86_400_000);
    const desdeISO = desde.toISOString();

    // Último análisis por referencia DENTRO del período.
    const rows = await db.query<LogRow>(
      `SELECT l.reference, l.agent_id, l.payload, l.timestamp
         FROM logs l
         JOIN (
           SELECT reference, agent_id, MAX(id) AS mid
             FROM logs
            WHERE agent_id IN ('call_intelligence','lead_enrichment')
              AND payload IS NOT NULL AND reference IS NOT NULL
              AND timestamp >= ?
            GROUP BY reference, agent_id
         ) m ON l.id = m.mid`,
      [desdeISO]
    );

    // ── Llamadas del período ────────────────────────────────────────────────
    const llamadas: CallIntelligenceOutput[] = [];
    const leads: { nombre: string; lead: LeadEnrichmentOutput }[] = [];
    for (const r of rows) {
      if (r.agent_id === "call_intelligence") {
        const c = safeParseJson<CallIntelligenceOutput>(r.payload);
        if (c) llamadas.push(c);
      } else {
        const l = safeParseJson<LeadEnrichmentOutput>(r.payload);
        if (l) leads.push({ nombre: parseReference(r.reference).itemName, lead: l });
      }
    }
    const evaluables = llamadas.filter((c) => (c.sandler?.puntajeFinal ?? 0) > 0);
    const noEvaluables = llamadas.length - evaluables.length;
    const sandlerProm = avg(evaluables.map((c) => c.sandler?.puntajeFinal).filter((n): n is number => typeof n === "number"));
    const challengerProm = avg(evaluables.map((c) => c.challenger?.score).filter((n): n is number => typeof n === "number"));
    const globalProm = avg(evaluables.map((c) => c.integrado?.scoreGlobal).filter((n): n is number => typeof n === "number"));

    // Etapa más débil del equipo en el período.
    const etapaAgg = new Map<string, number[]>();
    for (const c of evaluables) {
      for (const e of c.sandler?.etapas ?? []) {
        if (e.estado === "no_aplica") continue;
        const arr = etapaAgg.get(e.nombre) ?? [];
        arr.push(e.puntaje);
        etapaAgg.set(e.nombre, arr);
      }
    }
    const etapas = [...etapaAgg.entries()].map(([nombre, ps]) => ({ nombre, promedio: avg(ps) }));
    const etapaDebil = etapas.length ? etapas.reduce((min, e) => (e.promedio < min.promedio ? e : min)) : null;

    // Por vendedor.
    const vendAgg = new Map<string, number[]>();
    for (const c of evaluables) {
      const v = c.vendedorNombre?.trim() || "Sin identificar";
      const arr = vendAgg.get(v) ?? [];
      arr.push(c.integrado?.scoreGlobal ?? c.sandler?.puntajeFinal ?? 0);
      vendAgg.set(v, arr);
    }
    const porVendedor = [...vendAgg.entries()]
      .map(([vendedor, scores]) => ({ vendedor, llamadas: scores.length, globalProm: avg(scores) }))
      .sort((a, b) => b.globalProm - a.globalProm);

    // Objeciones y upsell.
    const objAgg = new Map<string, true[]>();
    for (const c of evaluables) for (const o of c.objeciones ?? []) {
      const k = o.trim();
      if (!k) continue;
      const arr = objAgg.get(k) ?? [];
      arr.push(true);
      objAgg.set(k, arr);
    }
    const objeciones = top(objAgg, 5);
    const upsells = evaluables.filter((c) => c.oportunidades?.hayOportunidad).length;

    // Leads del período.
    const calientes = leads.filter((l) => l.lead.prioridad === "caliente");
    const scoreLeadsProm = avg(leads.map((l) => l.lead.score).filter((n) => typeof n === "number"));

    // Alertas de seguimiento vigentes (preview, NO escribe en Monday).
    const nba = await runNextBestActionAgent({ write: false });
    const alertasAlta = nba.acciones.filter((a) => a.prioridad === "alta").slice(0, 5);

    // ── Markdown listo para enviar ─────────────────────────────────────────
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const md: string[] = [];
    md.push(`# Reporte ejecutivo de ventas — ${fmt(desde)} a ${fmt(hasta)}`);
    md.push("");
    md.push(`## 📞 Llamadas (${dias} días)`);
    md.push(`- Analizadas: **${llamadas.length}** (${evaluables.length} evaluables, ${noEvaluables} buzones/no evaluables)`);
    md.push(`- Calidad promedio: **Global ${globalProm}/100** · Sandler ${sandlerProm} · Challenger ${challengerProm}`);
    if (etapaDebil) md.push(`- 🎯 Etapa más débil del equipo: **${etapaDebil.nombre}** (${etapaDebil.promedio}/100) → foco de entrenamiento`);
    if (upsells) md.push(`- 💰 Llamadas con oportunidad de upsell/cross-sell: **${upsells}**`);
    md.push("");
    if (porVendedor.length) {
      md.push(`## 👥 Por vendedor`);
      md.push(`| Vendedor | Llamadas | Score global |`);
      md.push(`|---|---|---|`);
      for (const v of porVendedor) md.push(`| ${v.vendedor} | ${v.llamadas} | ${v.globalProm}/100 |`);
      md.push("");
    }
    md.push(`## 🧲 Leads nuevos`);
    md.push(`- Analizados: **${leads.length}** · Score promedio: ${scoreLeadsProm}/100 · Calientes: **${calientes.length}**`);
    if (calientes.length) md.push(`- 🔥 ${calientes.slice(0, 5).map((l) => `${l.nombre} (${l.lead.score})`).join(" · ")}`);
    md.push("");
    if (objeciones.length) {
      md.push(`## 🗣️ Objeciones recurrentes`);
      for (const o of objeciones) md.push(`- ${o.texto} (×${o.count})`);
      md.push("");
    }
    if (alertasAlta.length) {
      md.push(`## 🔔 Requieren acción inmediata (${nba.porPrioridad.alta} alertas de alta prioridad)`);
      for (const a of alertasAlta) md.push(`- **${a.itemName}**: ${a.motivo} → ${a.accionSugerida}`);
    }

    res.json({
      periodo: { desde: desdeISO, hasta: hasta.toISOString(), dias },
      stats: {
        llamadas: llamadas.length,
        evaluables: evaluables.length,
        noEvaluables,
        sandlerProm,
        challengerProm,
        globalProm,
        upsells,
        leadsNuevos: leads.length,
        leadsCalientes: calientes.length,
        alertasAlta: nba.porPrioridad.alta
      },
      etapaDebil,
      porVendedor,
      objeciones,
      markdown: md.join("\n")
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
