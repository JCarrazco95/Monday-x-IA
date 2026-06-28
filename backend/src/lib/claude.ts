import Anthropic from "@anthropic-ai/sdk";
import { PROVIDER, isMockMode, MODEL_DEFAULT, MODEL_HEAVY } from "./provider.js";
import { geminiStructured, geminiResearch } from "./gemini.js";

// ===========================================================================
//  Router de IA.
//
//  Este módulo mantiene la MISMA interfaz que usan los agentes
//  (structuredCompletion, webResearch, isMockMode, MODEL_DEFAULT, MODEL_HEAVY)
//  pero delega en el proveedor activo: Claude (deploy) o Gemini (pruebas).
//  En modo demo ejecuta las heurísticas (mockFn) sin llamar a ninguna IA.
// ===========================================================================

// Re-exports para no romper los imports existentes de los agentes.
export { isMockMode, MODEL_DEFAULT, MODEL_HEAVY };

const apiKey = process.env.ANTHROPIC_API_KEY;
export const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export interface WebResearchResult {
  text: string;
  sources: { titulo: string; url: string }[];
  usedWeb: boolean;
}

/**
 * Respuesta JSON estructurada. Según el proveedor activo:
 *  - claude: tool use (la herramienta define el schema).
 *  - gemini: responseMimeType JSON con el schema embebido.
 *  - demo:   ejecuta mockFn (heurísticas).
 */
export async function structuredCompletion<T>(opts: {
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  model?: string;
  mockFn: () => T;
}): Promise<T> {
  if (isMockMode) {
    return opts.mockFn();
  }

  if (PROVIDER === "gemini") {
    return geminiStructured<T>({
      system: opts.system,
      prompt: opts.prompt,
      inputSchema: opts.inputSchema,
      model: opts.model
    });
  }

  // PROVIDER === "claude"
  if (!anthropic) return opts.mockFn();

  const response = await anthropic.messages.create({
    model: opts.model ?? MODEL_DEFAULT,
    max_tokens: 2048,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema as Anthropic.Tool.InputSchema
      }
    ],
    tool_choice: { type: "tool", name: opts.toolName }
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error("Claude no devolvió una respuesta estructurada (tool_use).");
  }

  return toolUse.input as T;
}

/**
 * Investigación libre con búsqueda web. Según el proveedor activo:
 *  - claude: herramienta web_search server-side.
 *  - gemini: Google Search grounding.
 *  - demo:   no aplica (los agentes solo la llaman en modo live).
 */
export async function webResearch(opts: {
  system: string;
  prompt: string;
  model?: string;
  maxSearches?: number;
}): Promise<WebResearchResult> {
  if (isMockMode) {
    throw new Error("webResearch requiere un proveedor de IA configurado.");
  }

  if (PROVIDER === "gemini") {
    return geminiResearch({ system: opts.system, prompt: opts.prompt, model: opts.model });
  }

  // PROVIDER === "claude"
  if (!anthropic) {
    throw new Error("webResearch requiere ANTHROPIC_API_KEY");
  }

  const baseParams = {
    model: opts.model ?? MODEL_DEFAULT,
    max_tokens: 4096,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.prompt }]
  };

  let response;
  let usedWeb = true;
  try {
    response = await anthropic.messages.create({
      ...baseParams,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: opts.maxSearches ?? 5
        } as unknown as Anthropic.Tool
      ]
    });
  } catch {
    // La herramienta de búsqueda web no está disponible → conocimiento del modelo
    usedWeb = false;
    response = await anthropic.messages.create(baseParams);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const sources = extractSources(response.content);

  return { text, sources, usedWeb: usedWeb && sources.length > 0 };
}

/** Extrae títulos/URLs de los bloques de resultados de búsqueda y de las citas. */
function extractSources(content: unknown[]): { titulo: string; url: string }[] {
  const map = new Map<string, string>();
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.url === "string" && /^https?:\/\//.test(node.url)) {
      const titulo = typeof node.title === "string" ? node.title : node.url;
      if (!map.has(node.url)) map.set(node.url, titulo);
    }
    for (const key of Object.keys(node)) {
      const v = (node as Record<string, unknown>)[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  };
  content.forEach(visit);
  return Array.from(map.entries())
    .slice(0, 12)
    .map(([url, titulo]) => ({ url, titulo }));
}
