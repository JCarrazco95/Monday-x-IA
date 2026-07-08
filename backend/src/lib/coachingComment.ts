import type { CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  C.1 — Coaching accionable post-llamada.
//
//  Convierte el análisis de una llamada en un comentario corto y ACCIONABLE
//  para el vendedor (no solo el puntaje): qué mejorar, con qué frase, y el
//  objetivo de la próxima llamada. Se publica como update en el item de la
//  llamada en Monday (tablero de Aircall), donde las automatizaciones nativas
//  pueden notificar al vendedor.
// ===========================================================================

const BANDA_EMOJI: Record<string, string> = { verde: "🟢", amarillo: "🟡", rojo: "🔴" };

/** Comentario de coaching para el vendedor. Devuelve null si el análisis no
 *  es evaluable (buzón/score 0) o no trae material de coaching. */
export function buildCoachingComment(call: CallIntelligenceOutput): string | null {
  const sandler = call.sandler;
  const integrado = call.integrado;
  if (!sandler || sandler.puntajeFinal <= 0) return null; // buzón / no evaluable

  const lines: string[] = [];
  const score = integrado?.scoreGlobal ?? sandler.puntajeFinal;
  const banda = integrado?.banda ?? sandler.banda;
  lines.push(
    `🎓 Coaching de la llamada${call.vendedorNombre ? ` — ${call.vendedorNombre}` : ""}: ` +
      `${BANDA_EMOJI[banda] ?? ""} ${Math.round(score)}/100 (Sandler ${Math.round(sandler.puntajeFinal)} · Challenger ${Math.round(call.challenger?.score ?? 0)})`
  );

  // Etapa más débil de ESTA llamada (foco inmediato).
  const evaluables = sandler.etapas.filter((e) => e.estado !== "no_aplica");
  if (evaluables.length) {
    const debil = evaluables.reduce((min, e) => (e.puntaje < min.puntaje ? e : min));
    lines.push(`🎯 Etapa a trabajar: ${debil.nombre} (${Math.round(debil.puntaje)}/100)`);
  }

  // Mejoras accionables con frase lista para usar (máx 3, priorizadas).
  const orden = { alta: 0, media: 1, baja: 2 } as const;
  const mejoras = [...(call.vendedor?.mejoras ?? [])]
    .sort((a, b) => orden[a.prioridad] - orden[b.prioridad])
    .slice(0, 3);
  if (mejoras.length) {
    lines.push("");
    lines.push("✅ Para la próxima llamada:");
    for (const m of mejoras) {
      lines.push(`• [${m.prioridad}] ${m.accion}`);
      if (m.ejemploFrase) lines.push(`   💬 "${m.ejemploFrase}"`);
    }
  }

  if (integrado?.proximaLlamada) {
    lines.push("");
    lines.push(`📅 Próxima llamada: ${integrado.proximaLlamada}`);
  }

  // Sin material accionable no vale la pena comentar.
  return mejoras.length || integrado?.proximaLlamada ? lines.join("\n") : null;
}
