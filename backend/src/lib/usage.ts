// ===========================================================================
//  Telemetría de consumo de IA (tokens).
//
//  Antes no había forma de saber cuánto gasta cada llamada/lead. Aquí se acumula
//  el uso por proveedor/modelo y se expone en `GET /api/usage`, para dar
//  visibilidad de costo y poder poner topes. El acumulado en memoria se
//  reinicia con el proceso (útil para "desde que arrancó" en el panel); el
//  detalle persistente (para comparar consumo real entre proveedores/pasadas
//  a lo largo del tiempo) vive en `aiUsageStore.ts`.
// ===========================================================================

import { recordUsage } from "./aiUsageStore.js";

export interface UsageRecord {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

const byModel = new Map<string, UsageRecord>();
const since = new Date().toISOString();

function empty(): UsageRecord {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
}

/** Registra el uso de una respuesta de IA. Tolera campos ausentes. */
export function trackUsage(
  model: string,
  u: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null | undefined,
  /** `toolName` de `structuredCompletion` (p. ej. "venta_result") u otra
   *  etiqueta de operación, para poder comparar consumo por agente/pasada
   *  en el histórico persistente. Opcional: no rompe llamadas existentes. */
  operation?: string
): void {
  const rec = byModel.get(model) ?? empty();
  rec.calls += 1;
  const entry = {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u?.cache_creation_input_tokens ?? 0
  };
  rec.inputTokens += entry.inputTokens;
  rec.outputTokens += entry.outputTokens;
  rec.cacheReadTokens += entry.cacheReadTokens;
  rec.cacheCreationTokens += entry.cacheCreationTokens;
  byModel.set(model, rec);
  // Persistencia: fire-and-forget, nunca bloquea ni rompe al que llamó a trackUsage.
  recordUsage(model, operation ?? null, entry).catch(() => {});
}

/** Resumen acumulado por modelo + totales, para exponer en /api/usage. */
export function usageSummary() {
  const modelos = [...byModel.entries()].map(([model, r]) => ({ model, ...r }));
  const totales = modelos.reduce<UsageRecord>((acc, m) => {
    acc.calls += m.calls;
    acc.inputTokens += m.inputTokens;
    acc.outputTokens += m.outputTokens;
    acc.cacheReadTokens += m.cacheReadTokens;
    acc.cacheCreationTokens += m.cacheCreationTokens;
    return acc;
  }, empty());
  return { since, totales, modelos };
}
