import rateLimit from "express-rate-limit";

// ===========================================================================
//  Límites de tasa (rate limiting).
//
//  Objetivo principal: evitar el ABUSO DE COSTO. Los endpoints que disparan la
//  IA (orquestador, llamadas, asistente, scraper, NBA) pueden gastar tokens sin
//  freno; el `aiLimiter` los acota. El `apiLimiter` protege el resto de la API y
//  el `webhookLimiter` los webhooks entrantes.
//
//  Los límites son holgados para un uso normal de panel (un humano) pero cortan
//  los bucles automatizados. Configurables por entorno.
// ===========================================================================

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const common = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  message: { error: "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo." }
};

// General: ~1000 req / 15 min por IP (polling del panel entra de sobra).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: num(process.env.RATE_LIMIT_API, 1000),
  ...common
});

// IA / mutaciones costosas: ~100 req / 5 min por IP.
export const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: num(process.env.RATE_LIMIT_AI, 100),
  ...common
});

// Webhooks entrantes (Monday/Aircall): ~300 / 5 min por IP.
export const webhookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: num(process.env.RATE_LIMIT_WEBHOOK, 300),
  ...common
});
