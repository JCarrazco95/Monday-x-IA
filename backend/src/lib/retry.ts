// ===========================================================================
//  Reintentos con backoff exponencial + jitter para llamadas a proveedores
//  de IA (Anthropic/Gemini).
//
//  Solo se reintentan errores TRANSITORIOS (429 rate limit, 5xx, timeouts y
//  fallos de red). Los errores permanentes (400, 401, 403, JSON inválido…) se
//  propagan de inmediato: reintentarlos solo quema tiempo y tokens.
//
//  Con esto, un pico puntual del proveedor ya no degrada el análisis a
//  heurísticas (fallback); solo tras agotar los reintentos.
// ===========================================================================

const MAX_RETRIES = Math.max(0, Number(process.env.AI_MAX_RETRIES ?? 2));
const BASE_DELAY_MS = Math.max(100, Number(process.env.AI_RETRY_BASE_MS ?? 1000));

/** Códigos HTTP que vale la pena reintentar. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

/** Extrae el status HTTP de los errores de los SDKs (Anthropic/Gemini/fetch). */
function statusOf(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; statusCode?: unknown; code?: unknown };
  for (const v of [e.status, e.statusCode]) {
    if (typeof v === "number") return v;
  }
  return null;
}

/** ¿Es un error transitorio (red caída, timeout, rate limit, 5xx)? */
export function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== null) return RETRYABLE_STATUS.has(status);
  if (err instanceof Error) {
    // AbortSignal.timeout, fetch de red, sockets colgados.
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|fetch failed|network|socket hang up|overloaded/i.test(
      err.message
    );
  }
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ejecuta `fn` reintentando ante errores transitorios con backoff exponencial
 * y jitter (1s, 2s, 4s… ±25%). `label` aparece en el log de cada reintento.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? MAX_RETRIES;
  const base = opts.baseDelayMs ?? BASE_DELAY_MS;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      const delay = Math.round(base * 2 ** attempt * (0.75 + Math.random() * 0.5));
      console.warn(
        `[retry] ${label}: intento ${attempt + 1}/${retries} falló (${err instanceof Error ? err.message : err}); reintento en ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr; // inalcanzable, pero satisface a TypeScript
}
