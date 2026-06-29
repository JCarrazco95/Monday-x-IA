// ===========================================================================
//  Selección de proveedor de IA.
//
//  - En PRUEBAS puedes usar Google Gemini (tier gratuito).
//  - En DEPLOY usas Claude (Anthropic).
//
//  El proveedor se resuelve así:
//   1. Si AI_PROVIDER está definido (claude | gemini | demo) se respeta.
//   2. Si no, se autodetecta por las API keys presentes:
//        ANTHROPIC_API_KEY  -> claude
//        GEMINI_API_KEY     -> gemini   (también acepta GOOGLE_API_KEY)
//        (ninguna)          -> demo     (heurísticas, sin IA)
// ===========================================================================

export type AiProvider = "claude" | "gemini" | "demo";

const anthropicKey = process.env.ANTHROPIC_API_KEY;
export const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

function resolveProvider(): AiProvider {
  const forced = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (forced === "claude" || forced === "gemini" || forced === "demo") {
    // Si fuerzan un proveedor pero falta su key, caemos a demo de forma segura.
    if (forced === "claude" && !anthropicKey) return "demo";
    if (forced === "gemini" && !geminiKey) return "demo";
    return forced;
  }
  if (anthropicKey) return "claude";
  if (geminiKey) return "gemini";
  return "demo";
}

export const PROVIDER: AiProvider = resolveProvider();

/** Compatibilidad: "modo mock" = sin IA real (heurísticas). */
export const isMockMode = PROVIDER === "demo";

// ── Modelos por proveedor ────────────────────────────────────────────────────
// Los agentes piden MODEL_DEFAULT / MODEL_HEAVY sin saber el proveedor; aquí se
// traducen al modelo correcto del proveedor activo.

// Por defecto Haiku 4.5 (el modelo más económico: $1/$5 por 1M tokens). Rinde
// bien para el análisis de llamadas y reduce el consumo. Si se quiere más
// profundidad en una pasada concreta, subir CLAUDE_MODEL_HEAVY a sonnet/opus.
const CLAUDE_DEFAULT = process.env.CLAUDE_MODEL_DEFAULT ?? "claude-haiku-4-5";
const CLAUDE_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? "claude-haiku-4-5";

// Modelos Gemini gratuitos por defecto (configurables). Flash es gratis.
const GEMINI_DEFAULT = process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash";
const GEMINI_HEAVY = process.env.GEMINI_MODEL_HEAVY ?? "gemini-2.5-flash";

export const MODEL_DEFAULT =
  PROVIDER === "gemini" ? GEMINI_DEFAULT : CLAUDE_DEFAULT;
export const MODEL_HEAVY =
  PROVIDER === "gemini" ? GEMINI_HEAVY : CLAUDE_HEAVY;

export function providerLabel(): string {
  switch (PROVIDER) {
    case "claude":
      return `Claude (${MODEL_DEFAULT})`;
    case "gemini":
      return `Gemini (${MODEL_DEFAULT})`;
    default:
      return "Demo (heurísticas, sin IA)";
  }
}
