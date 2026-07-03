import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// ===========================================================================
//  Seguridad transversal: autenticación por API key, comparación de tiempo
//  constante y redacción de PII en la bitácora.
//
//  Filosofía (consistente con el resto del repo): las protecciones se ACTIVAN
//  cuando su secreto está configurado. Sin `API_KEY` el backend sigue abierto
//  (modo demo/local); en producción se define `API_KEY` y toda la API —salvo
//  /health y los webhooks (que tienen su propia verificación)— exige la clave.
// ===========================================================================

const API_KEY = process.env.API_KEY?.trim();
export const authEnabled = Boolean(API_KEY);

/** Comparación de strings en tiempo constante (evita ataques de temporización). */
export function safeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Extrae la clave del header `Authorization: Bearer <k>` o `x-api-key: <k>`. */
export function extractApiKey(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const x = req.header("x-api-key");
  return x?.trim() || null;
}

/**
 * Middleware: exige una API key válida SI la autenticación está activa.
 * Si no está configurada (`API_KEY` vacío), deja pasar (dev/demo) — el arranque
 * ya imprime una advertencia una sola vez (ver `warnIfAuthDisabled`).
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled) return next();
  if (safeCompare(extractApiKey(req), API_KEY)) return next();
  res.status(401).json({ error: "No autorizado: falta o es inválida la API key (header x-api-key)." });
}

let warned = false;
export function warnIfAuthDisabled(): void {
  if (authEnabled || warned) return;
  warned = true;
  console.warn(
    "⚠️  API_KEY no está configurada: la API queda ABIERTA (solo apto para demo/local). " +
      "Define API_KEY en el entorno para exigir autenticación en producción."
  );
}

// ---------------------------------------------------------------------------
//  Redacción de PII para la bitácora.
//  La bitácora (`logs`) guarda el payload de los agentes, que puede incluir
//  email/RFC/teléfono del cliente. Al exponerla (GET /logs, /logs/export) esos
//  datos NO son necesarios para auditar, así que se enmascaran. Las vistas que
//  legítimamente muestran datos del lead usan /leads (con su propio acceso).
// ---------------------------------------------------------------------------

// Claves cuyo valor se enmascara si aparece en cualquier nivel del payload.
const PII_KEYS = new Set(["email", "rfc", "telefono", "telefonos", "phone"]);

/** Enmascara un valor de PII dejando una pista mínima (ej. "ju***@***"). */
function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  if (key === "email") {
    const [user, domain] = value.split("@");
    if (domain) return `${user.slice(0, 2)}***@***`;
  }
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

/** Recorre un objeto/array y enmascara las claves de PII (no muta el original). */
export function redactPII<T>(input: T): T {
  if (Array.isArray(input)) return input.map((v) => redactPII(v)) as unknown as T;
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = PII_KEYS.has(k.toLowerCase()) ? maskValue(k.toLowerCase(), v) : redactPII(v);
    }
    return out as unknown as T;
  }
  return input;
}

/**
 * Enmascara la PII dentro de una fila de log cuyo `payload` es un string JSON.
 * Devuelve una copia con el payload re-serializado y redactado.
 */
export function redactLogRow<T extends { payload?: string | null }>(row: T): T {
  if (!row.payload) return row;
  try {
    const parsed = JSON.parse(row.payload);
    return { ...row, payload: JSON.stringify(redactPII(parsed)) };
  } catch {
    return row; // payload no-JSON: se deja igual
  }
}
