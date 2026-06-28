import { GoogleGenAI } from "@google/genai";
import { geminiKey, MODEL_DEFAULT } from "./provider.js";
import type { WebResearchResult } from "./claude.js";

// ===========================================================================
//  Adaptador de Google Gemini (tier gratuito para pruebas).
//
//  Implementa las mismas dos operaciones que el adaptador de Claude:
//   - structuredCompletion: salida JSON estructurada (responseMimeType JSON).
//   - webResearch: investigación con Google Search grounding.
//
//  Nota: Gemini no permite combinar salida estructurada + búsqueda web en una
//  sola petición, pero aquí nunca se combinan (son funciones separadas).
// ===========================================================================

// El JSON del enriquecimiento de leads es grande (desglose + investigación).
// Damos margen amplio para que no se trunque la respuesta.
const MAX_OUTPUT_TOKENS = 8192;

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    if (!geminiKey) throw new Error("Gemini requiere GEMINI_API_KEY (o GOOGLE_API_KEY).");
    _ai = new GoogleGenAI({ apiKey: geminiKey });
  }
  return _ai;
}

/** Si el modelo recibido no es de Gemini (p. ej. uno de Claude), usa el default. */
function geminiModel(model?: string): string {
  return model && model.toLowerCase().startsWith("gemini") ? model : MODEL_DEFAULT;
}

/** Parser tolerante: intenta JSON.parse y, si falla, extrae el bloque {...}. */
function parseJsonLoose<T>(raw: string): T {
  const text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }
    throw new Error(
      "Gemini devolvió un JSON inválido o truncado. Intenta de nuevo o sube GEMINI_MODEL_* / tokens."
    );
  }
}

export async function geminiStructured<T>(opts: {
  system: string;
  prompt: string;
  inputSchema: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const ai = getAi();
  const systemInstruction = `${opts.system}

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown ni texto adicional) que cumpla este JSON Schema:
${JSON.stringify(opts.inputSchema)}`;

  const response = await ai.models.generateContent({
    model: geminiModel(opts.model),
    contents: opts.prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.4,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Desactiva el "thinking" para que todo el presupuesto de tokens vaya al
      // JSON (evita que la respuesta se trunque) y reduce la latencia.
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  const text = response.text ?? "";
  if (!text) throw new Error("Gemini devolvió una respuesta vacía.");
  return parseJsonLoose<T>(text);
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export async function geminiResearch(opts: {
  system: string;
  prompt: string;
  model?: string;
}): Promise<WebResearchResult> {
  const ai = getAi();
  const model = geminiModel(opts.model);

  let response;
  let usedWeb = true;
  try {
    response = await ai.models.generateContent({
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        tools: [{ googleSearch: {} }],
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    });
  } catch {
    // La búsqueda web no está disponible → conocimiento del modelo.
    usedWeb = false;
    response = await ai.models.generateContent({
      model,
      contents: opts.prompt,
      config: { systemInstruction: opts.system, maxOutputTokens: MAX_OUTPUT_TOKENS }
    });
  }

  const text = response.text ?? "";

  // Extrae fuentes del grounding metadata.
  const map = new Map<string, string>();
  const candidates = (response as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: GroundingChunk[] } }> })
    .candidates ?? [];
  for (const c of candidates) {
    for (const chunk of c.groundingMetadata?.groundingChunks ?? []) {
      const uri = chunk.web?.uri;
      if (uri && /^https?:\/\//.test(uri) && !map.has(uri)) {
        map.set(uri, chunk.web?.title ?? uri);
      }
    }
  }
  const sources = Array.from(map.entries())
    .slice(0, 12)
    .map(([url, titulo]) => ({ url, titulo }));

  return { text, sources, usedWeb: usedWeb && sources.length > 0 };
}
