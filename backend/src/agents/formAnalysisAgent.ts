import { structuredCompletion } from "../lib/claude.js";
import type { FormAnalysisInput, FormAnalysisOutput } from "./types.js";

export const AGENT_ID = "form_analysis";

const FLOTA_DISPONIBLE = [
  "sedán compacto",
  "sedán ejecutivo",
  "suv compacta",
  "suv mediana",
  "pickup doble cabina",
  "van de carga",
  "van de pasajeros (12)",
  "camión 3.5 ton"
];

const SYSTEM_PROMPT = `Eres el "Form Analysis Agent" de MAXIRent, una empresa de renta de vehículos en México.
Tu trabajo es analizar las respuestas de un formulario de cotización/contacto que llenó un prospecto y:
1. Identificar qué vehículo(s) le interesan.
2. Estimar la duración de la renta (diaria, semanal, mensual, largo plazo).
3. Clasificar si es un cliente personal o empresarial.
4. Determinar el nivel de urgencia (baja, media, alta) según el lenguaje usado.
5. Verificar si el vehículo solicitado existe en la flota disponible: ${FLOTA_DISPONIBLE.join(", ")}.
6. Mapear los datos relevantes a columnas de Monday.com (nombres de columna en snake_case).
7. Redactar una plantilla de respuesta breve y profesional en español para el vendedor (máx 4 líneas).
8. Hacer un resumen ejecutivo de 1-2 líneas para la bitácora interna.

Responde siempre usando la herramienta "form_analysis_result".`;

export async function runFormAnalysisAgent(
  input: FormAnalysisInput
): Promise<FormAnalysisOutput> {
  return structuredCompletion<FormAnalysisOutput>({
    system: SYSTEM_PROMPT,
    prompt: `Item de Monday: ${input.itemName} (ID: ${input.itemId})

Respuestas del formulario:
${Object.entries(input.formResponses)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`,
    toolName: "form_analysis_result",
    toolDescription: "Resultado estructurado del análisis del formulario de un lead.",
    inputSchema: {
      type: "object",
      properties: {
        vehiculoInteres: { type: "string" },
        duracionRenta: { type: "string" },
        tipoCliente: { type: "string", enum: ["personal", "empresarial"] },
        urgencia: { type: "string", enum: ["baja", "media", "alta"] },
        disponibleEnFlota: { type: "boolean" },
        columnasMonday: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        plantillaRespuesta: { type: "string" },
        resumen: { type: "string" }
      },
      required: [
        "vehiculoInteres",
        "duracionRenta",
        "tipoCliente",
        "urgencia",
        "disponibleEnFlota",
        "columnasMonday",
        "plantillaRespuesta",
        "resumen"
      ]
    },
    mockFn: () => mockFormAnalysis(input)
  });
}

// ----- Modo demo (sin ANTHROPIC_API_KEY) -----
function mockFormAnalysis(input: FormAnalysisInput): FormAnalysisOutput {
  const text = Object.values(input.formResponses).join(" ").toLowerCase();

  const vehiculoInteres = FLOTA_DISPONIBLE.find((v) =>
    text.includes(v.split(" ")[0])
  ) ?? "Pickup doble cabina";

  const esEmpresarial = /empresa|s\.a\.|sa de cv|razón social|flotilla|negocio/.test(text);
  const urgente = /urgente|hoy|mañana|lo antes posible|inmediato/.test(text);

  return {
    vehiculoInteres,
    duracionRenta: text.includes("mes") ? "Mensual / largo plazo" : "Corto plazo (días-semanas)",
    tipoCliente: esEmpresarial ? "empresarial" : "personal",
    urgencia: urgente ? "alta" : "media",
    disponibleEnFlota: FLOTA_DISPONIBLE.includes(vehiculoInteres.toLowerCase()),
    columnasMonday: {
      vehiculo_interes: vehiculoInteres,
      duracion_renta: text.includes("mes") ? "mensual" : "corto_plazo",
      tipo_cliente: esEmpresarial ? "empresarial" : "personal",
      urgencia: urgente ? "alta" : "media"
    },
    plantillaRespuesta: `Hola, gracias por tu interés en MAXIRent. Confirmamos disponibilidad de ${vehiculoInteres} y con gusto preparamos una cotización. ¿Podrías confirmarnos las fechas exactas que necesitas?`,
    resumen: `Lead interesado en ${vehiculoInteres}, perfil ${esEmpresarial ? "empresarial" : "personal"}, urgencia ${urgente ? "alta" : "media"}. (modo demo)`
  };
}
