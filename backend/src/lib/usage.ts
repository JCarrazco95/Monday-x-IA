// ===========================================================================
//  Telemetría de consumo de IA (tokens).
//
//  Antes no había forma de saber cuánto gasta cada llamada/lead. Aquí se acumula
//  el uso por proveedor/modelo y se expone en `GET /api/usage`, para dar
//  visibilidad de costo y poder poner topes. Es en memoria (se reinicia con el
//  proceso); suficiente para monitoreo operativo sin añadir una tabla.
// ===========================================================================

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
  } | null | undefined
): void {
  const rec = byModel.get(model) ?? empty();
  rec.calls += 1;
  rec.inputTokens += u?.input_tokens ?? 0;
  rec.outputTokens += u?.output_tokens ?? 0;
  rec.cacheReadTokens += u?.cache_read_input_tokens ?? 0;
  rec.cacheCreationTokens += u?.cache_creation_input_tokens ?? 0;
  byModel.set(model, rec);
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
