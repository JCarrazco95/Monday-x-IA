import { db } from "../db/index.js";
import { structuredCompletion, webResearch, isMockMode, MODEL_HEAVY } from "../lib/claude.js";
import { intelKey, getCompanyIntel, saveCompanyIntel } from "../lib/companyIntel.js";
import { searchGovernmentContracts } from "../lib/governmentIntel.js";
import type {
  LeadEnrichmentInput,
  LeadEnrichmentOutput,
  CompanyResearch,
  ScoreFactor
} from "./types.js";

export const AGENT_ID = "lead_enrichment";

/**
 * Rúbrica de scoring (suma 100). Es la fuente de verdad tanto para el prompt
 * de Claude como para el modo demo, para que el puntaje sea transparente,
 * consistente y fácil de ajustar.
 */
const SCORING_RUBRIC: { factor: string; max: number; guia: string }[] = [
  { factor: "Necesidad / intención vehicular", max: 28, guia: "FACTOR DECISIVO. Señales de que necesitan vehículos: proyectos activos, expansión, flota propia obsoleta, operación con personal/carga en campo. A más evidencia, más puntos." },
  { factor: "Ajuste de sector a renta de flota", max: 16, guia: "Cualquier industria que requiera transporte/vehículos es buen fit (construcción, logística, agro, minería, turismo, servicios en campo, distribución). Solo operación 100% de oficina sin movilidad puntúa bajo." },
  { factor: "Tamaño y capacidad de la empresa", max: 14, guia: "Más empleados/sucursales/facturación estimada = mayor puntaje y mayor potencial de flota." },
  { factor: "Calidad y completitud de datos", max: 14, guia: "Razón social + RFC con formato válido + email corporativo + teléfono. Email genérico (gmail/hotmail) resta." },
  { factor: "Formalidad y presencia digital", max: 10, guia: "Sitio web activo, LinkedIn, redes y reputación = empresa seria y contactable." },
  { factor: "Oportunidad vs. competencia", max: 10, guia: "Si ya renta con otra marca o tiene flota propia cara = alta oportunidad de captura. Sin señal = medio." },
  { factor: "Sector gobierno / contratos", max: 8, guia: "Licitaciones o contratos públicos = capacidad de pago y proyectos grandes recurrentes." }
];

const RUBRIC_TEXT = SCORING_RUBRIC.map(
  (r, i) => `${i + 1}. ${r.factor} (0–${r.max}): ${r.guia}`
).join("\n");

const SYSTEM_PROMPT = `Eres el "Lead Enrichment Agent" de MAXIRent, empresa mexicana de renta de vehículos y flotillas B2B.
Tu misión: entregarle al vendedor TODO lo necesario para cerrar la venta, con un puntaje transparente y un plan de acción.

CÓMO CALIFICAR (score 0–100). Asigna puntos por cada criterio según esta rúbrica y devuelve el desglose en "scoreBreakdown".
El "score" final DEBE ser la suma exacta de los puntos del desglose. El factor #1 (necesidad/intención vehicular) es el más importante: pésalo con rigor.
${RUBRIC_TEXT}

REGLA DURA: si NO hay RFC ni razón social (persona física o datos fiscales ausentes), el lead casi se descalifica: score máximo 35, prioridad "fria", riesgo "alto", y dilo en "riesgosComerciales". Es preferible nutrir antes de invertir tiempo de venta.

Reglas de salida:
- "prioridad": caliente si score ≥ 75, tibia si 50–74, fria si < 50.
- "riesgo": bajo si score ≥ 70, medio si 45–69, alto si < 45 (ajústalo si hay banderas claras: datos falsos, RFC inválido, sin razón social).
- "accionRecomendada": la PRIMERA acción inmediata, concreta y con tiempo (ej. "Llamar en <1h y abrir con X").
- "siguientesPasos": playbook de 3–5 pasos para avanzar la venta.
- "preguntasDiscovery": 3–6 preguntas clave para la primera llamada (calificar necesidad, volumen, plazo, presupuesto, decisor).
- "riesgosComerciales": banderas a vigilar (morosidad, datos incompletos, competencia ya instalada, etc.).
- "research": investigación a fondo (sectores, debilidades, qué le resolvemos, flota sugerida, competencia, gobierno, presencia digital, fuentes con URL, confianza).
- "research.presenciaDigital": web {url, resumen}, redes [{red, url, resumen}] y linkedin {url, resumen}. En "linkedin.url" pon SOLO el link del perfil de la EMPRESA en LinkedIn (no de personas). No incluyas contactos de personas. No inventes URLs.
Sé específico, cuantitativo donde puedas, y 100% orientado a vender. No inventes fuentes ni datos.
Los campos "duplicado" y "duplicadoRef" los pone el sistema: déjalos en false / null.
Responde SIEMPRE con la herramienta "lead_enrichment_result".`;

const RESEARCH_SYSTEM = `Eres un analista de inteligencia comercial B2B para MAXIRent (renta de vehículos y flotillas en México).
Investiga a fondo la empresa indicada usando la web. Prioriza fuentes útiles para venta: sitio web oficial, LinkedIn,
redes sociales, directorios de empresas, noticias y portales de gobierno (CompraNet, DOF, transparencia) para detectar
licitaciones o contratos públicos. Busca señales de necesidad de transporte/flotilla, tamaño/empleados, y si ya rentan o
usan vehículos de otras marcas/rentadoras. Resume hallazgos con datos verificables y cita las URLs de tus fuentes.`;

const RESULT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    scoreBreakdown: {
      type: "array",
      description: "Desglose del score por cada criterio de la rúbrica.",
      items: {
        type: "object",
        properties: {
          factor: { type: "string" },
          puntos: { type: "number" },
          max: { type: "number" },
          justificacion: { type: "string" }
        },
        required: ["factor", "puntos", "max", "justificacion"]
      }
    },
    prioridad: { type: "string", enum: ["caliente", "tibia", "fria"] },
    perfilEmpresa: { type: "string" },
    riesgo: { type: "string", enum: ["bajo", "medio", "alto"] },
    accionRecomendada: { type: "string" },
    siguientesPasos: { type: "array", items: { type: "string" } },
    preguntasDiscovery: { type: "array", items: { type: "string" } },
    riesgosComerciales: { type: "array", items: { type: "string" } },
    resumen: { type: "string" },
    research: {
      type: "object",
      properties: {
        sectores: { type: "array", items: { type: "string" } },
        giroPrincipal: { type: "string" },
        tamanoEstimado: { type: "string" },
        ubicacion: { type: "string" },
        presenciaDigital: {
          type: "object",
          description: "Por cada canal incluye la URL y un resumen breve de lo que se encontró ahí.",
          properties: {
            web: {
              type: "object",
              properties: { url: { type: "string" }, resumen: { type: "string" } }
            },
            linkedin: {
              type: "object",
              properties: {
                url: { type: "string" },
                resumen: { type: "string" },
                perfilContacto: {
                  type: "object",
                  description: "Perfil de LinkedIn de la persona que registró el lead (el Contacto), SOLO si su perfil corresponde a la razón social. No inventes nombres ni URLs.",
                  properties: {
                    nombre: { type: "string" },
                    puesto: { type: "string" },
                    url: { type: "string" },
                    coincideEmpresa: { type: "boolean" },
                    resumen: { type: "string" }
                  },
                  required: ["nombre", "coincideEmpresa"]
                },
                contactos: {
                  type: "array",
                  description: "Puestos/contactos clave, SOBRE TODO del área de compras/adquisiciones. NO inventes nombres de personas.",
                  items: {
                    type: "object",
                    properties: {
                      nombre: { type: "string" },
                      puesto: { type: "string" },
                      area: { type: "string" },
                      url: { type: "string" }
                    },
                    required: ["puesto"]
                  }
                }
              }
            },
            redes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  red: { type: "string" },
                  url: { type: "string" },
                  resumen: { type: "string" }
                },
                required: ["red"]
              }
            },
            notas: { type: "string" }
          }
        },
        debilidades: { type: "array", items: { type: "string" } },
        oportunidadesMaxirent: { type: "array", items: { type: "string" } },
        necesidadVehicular: { type: "string" },
        argumentarioVenta: { type: "array", items: { type: "string" } },
        rentaOtrasMarcas: {
          type: "object",
          properties: {
            detectado: { type: "boolean" },
            competidores: { type: "array", items: { type: "string" } },
            detalle: { type: "string" }
          },
          required: ["detectado"]
        },
        gobierno: {
          type: "object",
          properties: {
            tieneContratos: { type: "boolean" },
            detalle: { type: "string" },
            fuente: { type: "string" }
          },
          required: ["tieneContratos"]
        },
        fuentes: {
          type: "array",
          items: {
            type: "object",
            properties: { titulo: { type: "string" }, url: { type: "string" } },
            required: ["titulo", "url"]
          }
        },
        confianza: { type: "string", enum: ["alta", "media", "baja"] }
      },
      required: [
        "sectores",
        "presenciaDigital",
        "debilidades",
        "oportunidadesMaxirent",
        "argumentarioVenta",
        "rentaOtrasMarcas",
        "gobierno",
        "fuentes",
        "confianza"
      ]
    }
  },
  required: [
    "score",
    "scoreBreakdown",
    "prioridad",
    "perfilEmpresa",
    "riesgo",
    "accionRecomendada",
    "siguientesPasos",
    "preguntasDiscovery",
    "riesgosComerciales",
    "resumen",
    "research"
  ]
};

export async function runLeadEnrichmentAgent(
  input: LeadEnrichmentInput
): Promise<LeadEnrichmentOutput> {
  const dup = await findDuplicate(input);
  const key = intelKey(input.razonSocial, input.rfc);
  const prior = key ? await getCompanyIntel(key) : null;

  // Modo demo: heurísticas con desglose de score
  if (isMockMode) {
    const result = mockEnrichment(input, prior?.research ?? null);
    finalizeScore(result, input);
    if (result.research) await applyGovernmentIntel(result.research, input.razonSocial);
    const conocimientoPrevio = Boolean(prior);
    if (key && result.research) {
      await saveCompanyIntel({ key, razonSocial: input.razonSocial, rfc: input.rfc, research: result.research, fuente: "demo" });
    }
    return { ...result, duplicado: dup.isDuplicate, duplicadoRef: dup.ref, fuenteAnalisis: "demo", conocimientoPrevio };
  }

  // Modo live: investigación web + estructuración
  let researchNotes = "";
  let webSources: { titulo: string; url: string }[] = [];
  let fuenteAnalisis: "web" | "modelo" = "modelo";

  if (input.razonSocial) {
    try {
      const res = await webResearch({
        system: RESEARCH_SYSTEM,
        model: MODEL_HEAVY,
        maxSearches: 6,
        prompt: buildResearchPrompt(input, prior?.research ?? null)
      });
      researchNotes = res.text;
      webSources = res.sources;
      fuenteAnalisis = res.usedWeb ? "web" : "modelo";
    } catch {
      researchNotes = "";
    }
  }

  const aiResult = await structuredCompletion<Omit<LeadEnrichmentOutput, "duplicado" | "duplicadoRef">>({
    system: SYSTEM_PROMPT,
    model: MODEL_HEAVY,
    prompt: buildAnalysisPrompt(input, researchNotes, webSources, prior?.research ?? null),
    toolName: "lead_enrichment_result",
    toolDescription: "Calificación ponderada + investigación a fondo del lead para potenciar la venta.",
    inputSchema: RESULT_SCHEMA,
    mockFn: () => mockEnrichment(input, prior?.research ?? null)
  });

  finalizeScore(aiResult, input);
  if (aiResult.research && webSources.length && aiResult.research.fuentes.length === 0) {
    aiResult.research.fuentes = webSources;
  }
  if (aiResult.research) await applyGovernmentIntel(aiResult.research, input.razonSocial);

  const conocimientoPrevio = Boolean(prior);
  if (key && aiResult.research) {
    await saveCompanyIntel({ key, razonSocial: input.razonSocial, rfc: input.rfc, research: aiResult.research, fuente: fuenteAnalisis });
  }

  return { ...aiResult, duplicado: dup.isDuplicate, duplicadoRef: dup.ref, fuenteAnalisis, conocimientoPrevio };
}

/**
 * Sobrescribe research.gobierno con datos REALES de la API de Contrataciones
 * Abiertas (CompraNet). Si la API no responde, deja la inferencia de la IA.
 */
async function applyGovernmentIntel(research: CompanyResearch, razonSocial?: string): Promise<void> {
  const gov = await searchGovernmentContracts(razonSocial);
  if (!gov) return;
  const ejemplos = gov.ejemplos
    .map((e) => `${e.titulo}${e.comprador ? ` (${e.comprador})` : ""}`)
    .join("; ");
  research.gobierno = {
    tieneContratos: gov.tieneContratos,
    detalle: ejemplos ? `${gov.detalle} Ejemplos: ${ejemplos}` : gov.detalle,
    fuente: gov.fuente
  };
}

// ---------------- Prompts ----------------

function buildResearchPrompt(input: LeadEnrichmentInput, prior: CompanyResearch | null): string {
  return `Investiga a fondo esta empresa mexicana para una venta de renta de flotilla:

- Razón social: ${input.razonSocial ?? "N/D"}
- RFC: ${input.rfc ?? "N/D"}
- Contacto: ${input.nombre}${input.email ? ` <${input.email}>` : ""}

Quiero: a qué se dedica y sector(es); tamaño aproximado (empleados/sucursales); ubicación; presencia digital
(web, LinkedIn, redes); si el contacto "${input.nombre}" tiene un perfil de LinkedIn que corresponda a esta empresa (incluye su URL); debilidades o retos del negocio; si tiene contratos o licitaciones con gobierno
(CompraNet/DOF/transparencia); si ya renta o usa vehículos de otras marcas o rentadoras; y qué tipo de flota
podría necesitar. Cita las URLs de tus fuentes.
${prior ? `\nInformación previa que ya teníamos (verifícala y actualízala si encuentras algo nuevo):\n${JSON.stringify(prior).slice(0, 1500)}` : ""}`;
}

function buildAnalysisPrompt(
  input: LeadEnrichmentInput,
  notes: string,
  sources: { titulo: string; url: string }[],
  prior: CompanyResearch | null
): string {
  return `Item de Monday: ${input.itemName} (ID: ${input.itemId})

Datos del lead:
- Nombre: ${input.nombre}
- Email: ${input.email ?? "N/D"}
- Teléfono: ${input.telefono ?? "N/D"}
- Razón social: ${input.razonSocial ?? "N/D"}
- RFC: ${input.rfc ?? "N/D"}

${notes ? `Investigación encontrada en la web:\n"""\n${notes}\n"""` : "No se realizó búsqueda web; usa tu conocimiento del sector y refleja baja confianza en la investigación."}

${sources.length ? `Fuentes detectadas:\n${sources.map((s) => `- ${s.titulo}: ${s.url}`).join("\n")}` : ""}
${prior ? `\nConocimiento previo acumulado de esta empresa:\n${JSON.stringify(prior).slice(0, 1500)}` : ""}

Califica con la rúbrica (devuelve el desglose) y consolida todo orientado a cerrar la venta.`;
}

// ----- Duplicados -----
async function findDuplicate(
  input: LeadEnrichmentInput
): Promise<{ isDuplicate: boolean; ref: string | null }> {
  if (!input.email && !input.rfc) return { isDuplicate: false, ref: null };
  const row = await db.queryOne<{ reference: string }>(
    `SELECT reference, payload FROM logs
       WHERE agent_id = 'lead_enrichment'
       AND reference IS NOT NULL AND reference != ?
       AND (payload LIKE ? OR payload LIKE ?)
       ORDER BY timestamp DESC LIMIT 1`,
    [
      input.itemName,
      input.email ? `%${input.email}%` : "%__no_email__%",
      input.rfc ? `%${input.rfc}%` : "%__no_rfc__%"
    ]
  );
  return row ? { isDuplicate: true, ref: row.reference } : { isDuplicate: false, ref: null };
}

/**
 * Aplica coherencia y reglas duras de negocio al resultado (mock o live):
 * - el score = suma exacta del desglose;
 * - REGLA DURA: sin RFC ni razón social → score tope 35, riesgo alto, nota;
 * - deriva prioridad y riesgo del score final.
 */
function finalizeScore(
  r: Omit<LeadEnrichmentOutput, "duplicado" | "duplicadoRef">,
  input: LeadEnrichmentInput
): void {
  if (Array.isArray(r.scoreBreakdown) && r.scoreBreakdown.length) {
    const sum = r.scoreBreakdown.reduce((s, f) => s + (Number(f.puntos) || 0), 0);
    r.score = Math.max(0, Math.min(100, Math.round(sum)));
  }

  const sinDatosFiscales = !input.rfc && !input.razonSocial;
  if (sinDatosFiscales) {
    r.score = Math.min(r.score, 35);
    const nota = "Sin RFC ni razón social (posible persona física): validar datos fiscales antes de invertir tiempo de venta.";
    if (!Array.isArray(r.riesgosComerciales)) r.riesgosComerciales = [];
    if (!r.riesgosComerciales.some((x) => x.includes("RFC ni razón social"))) {
      r.riesgosComerciales.unshift(nota);
    }
  }

  r.prioridad = r.score >= 75 ? "caliente" : r.score >= 50 ? "tibia" : "fria";
  r.riesgo = sinDatosFiscales ? "alto" : r.score >= 70 ? "bajo" : r.score >= 45 ? "medio" : "alto";
}

// ----- Modo demo enriquecido con desglose de score -----
function mockEnrichment(
  input: LeadEnrichmentInput,
  prior: CompanyResearch | null
): Omit<LeadEnrichmentOutput, "duplicado" | "duplicadoRef"> {
  const rs = input.razonSocial ?? "";
  const sector = guessSector(rs);
  const rfcValido = !!input.rfc && /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(input.rfc);
  const emailCorp = !!input.email && !/gmail|hotmail|outlook|yahoo/i.test(input.email);
  // Sectores con alta necesidad de transporte. "Servicios" (oficina) queda como medio.
  const sectorAlto = ["Construcción", "Transporte y logística", "Agroindustria", "Minería", "Comercio y distribución", "Turismo"].includes(sector ?? "");
  const esEmpresa = /sa de cv|s\.a\.|s\. de r\.l\.|sapi/i.test(rs);

  // --- Desglose de score según la rúbrica (pesos afinados: necesidad manda) ---
  const breakdown: ScoreFactor[] = [
    {
      factor: "Necesidad / intención vehicular",
      max: 28,
      puntos: sectorAlto ? 17 : sector ? 12 : 8,
      justificacion: "Sin señal explícita de intención aún; estimada por sector. CONFIRMAR en discovery (es el factor decisivo)."
    },
    {
      factor: "Ajuste de sector a renta de flota",
      max: 16,
      puntos: sectorAlto ? 15 : sector ? 11 : 9,
      justificacion: sector ? `Sector "${sector}" ${sectorAlto ? "con clara necesidad de transporte" : "con necesidad moderada"}.` : "Sector no identificado; la mayoría de industrias requieren transporte (estimación media)."
    },
    {
      factor: "Tamaño y capacidad de la empresa",
      max: 14,
      puntos: esEmpresa ? 9 : 5,
      justificacion: esEmpresa ? "Persona moral (SA/SRL): potencial de flota mayor." : "Tamaño no confirmado; estimado micro/pequeña."
    },
    {
      factor: "Calidad y completitud de datos",
      max: 14,
      puntos: (rs ? 5 : 0) + (rfcValido ? 5 : 0) + (emailCorp ? 3 : input.email ? 1 : 0) + (input.telefono ? 1 : 0),
      justificacion: `Razón social ${rs ? "sí" : "no"}, RFC ${rfcValido ? "válido" : "inválido/ausente"}, email ${emailCorp ? "corporativo" : input.email ? "genérico" : "ausente"}, teléfono ${input.telefono ? "sí" : "no"}.`
    },
    {
      factor: "Formalidad y presencia digital",
      max: 10,
      puntos: esEmpresa ? 6 : 4,
      justificacion: "Pendiente de verificar web/LinkedIn (modo demo)."
    },
    {
      factor: "Oportunidad vs. competencia",
      max: 10,
      puntos: 5,
      justificacion: "Sin datos de competencia todavía; oportunidad media por defecto."
    },
    {
      factor: "Sector gobierno / contratos",
      max: 8,
      puntos: 2,
      justificacion: "Sin verificar en CompraNet/DOF (requiere búsqueda web o API de gobierno)."
    }
  ];
  const score = Math.max(0, Math.min(100, breakdown.reduce((s, f) => s + f.puntos, 0)));
  const prioridad: LeadEnrichmentOutput["prioridad"] = score >= 75 ? "caliente" : score >= 50 ? "tibia" : "fria";
  const riesgo: LeadEnrichmentOutput["riesgo"] = score >= 70 ? "bajo" : score >= 45 ? "medio" : "alto";

  const research: CompanyResearch = prior ?? {
    sectores: sector ? [sector] : ["Por confirmar"],
    giroPrincipal: sector ?? null,
    tamanoEstimado: esEmpresa ? "PyME / mediana (estimado)" : "Micro / pequeña (estimado)",
    ubicacion: null,
    presenciaDigital: {
      web: null,
      linkedin: rs ? {
        url: null,
        resumen: `Buscar "${rs}" en LinkedIn (modo demo, sin búsqueda web).`,
        perfilContacto: input.nombre
          ? { nombre: input.nombre, puesto: null, url: null, coincideEmpresa: false, resumen: `Verificar en LinkedIn si ${input.nombre} pertenece a ${rs} (modo demo).` }
          : null,
        contactos: [
          { puesto: "Gerente / Encargado de Compras", area: "Compras / Adquisiciones", nombre: null, url: null },
          { puesto: "Director General", area: "Dirección", nombre: null, url: null }
        ]
      } : null,
      redes: [],
      notas: "Pendiente de verificación (modo demo, sin búsqueda web)."
    },
    debilidades: sectorWeaknesses(sector),
    oportunidadesMaxirent: sectorOpportunities(sector),
    necesidadVehicular: sectorFleet(sector),
    argumentarioVenta: [
      "Renta sin inversión inicial: convierte CAPEX en gasto 100% deducible.",
      "Mantenimiento, seguro y reemplazo incluidos: cero distracción operativa.",
      "Flota escalable: sube o baja unidades según la demanda del proyecto."
    ],
    rentaOtrasMarcas: { detectado: false, competidores: [], detalle: "Sin datos (verificar en llamada)." },
    gobierno: { tieneContratos: false, detalle: "Sin verificar (requiere consulta a CompraNet/DOF).", fuente: null },
    fuentes: [],
    confianza: "baja"
  };

  const perfilEmpresa = rs
    ? `${rs} — ${research.sectores.join(", ")}. ${research.tamanoEstimado ?? ""} (modo demo)`.trim()
    : "Sin razón social — posible persona física. (modo demo)";

  return {
    score,
    scoreBreakdown: breakdown,
    prioridad,
    perfilEmpresa,
    riesgo,
    accionRecomendada:
      prioridad === "caliente"
        ? `Llamar en <1h. Abrir con: "${research.argumentarioVenta[0]}"`
        : prioridad === "tibia"
        ? "Confirmar necesidad de flota y datos faltantes antes de cotizar (esta semana)."
        : "Nutrir: enviar info y solicitar datos faltantes (RFC/razón social) antes de invertir tiempo.",
    siguientesPasos: [
      "Contactar al decisor y validar la necesidad real de transporte.",
      "Calificar volumen de unidades, plazo y presupuesto aproximado.",
      `Proponer flota sugerida: ${research.necesidadVehicular}.`,
      "Enviar cotización con opción de renta a plazo y beneficios fiscales.",
      "Agendar seguimiento y, si aplica, visita a la flota disponible."
    ],
    preguntasDiscovery: [
      "¿Cuántas unidades necesitarían y para qué uso específico?",
      "¿Por cuánto tiempo (días, meses, contrato anual)?",
      "¿Hoy tienen flota propia o rentan con alguien? ¿Qué les gustaría mejorar?",
      "¿Quién toma la decisión y en qué plazo necesitan resolverlo?",
      "¿Tienen un presupuesto mensual estimado para movilidad?"
    ],
    riesgosComerciales: [
      ...(rfcValido ? [] : ["RFC ausente o con formato inválido: validar identidad fiscal."]),
      ...(emailCorp ? [] : ["Email no corporativo: confirmar que es un contacto de empresa real."]),
      "Competencia posiblemente ya instalada: indagar contrato vigente y fecha de renovación."
    ],
    resumen: `Score ${score}/100 (${prioridad}), riesgo ${riesgo}. Sector: ${research.sectores.join(", ")}. (modo demo)`,
    research
  };
}

// ----- Heurísticas de sector (modo demo) -----
function guessSector(rs: string): string | null {
  const t = rs.toLowerCase();
  if (/constru|edifica|obra|inmobili|edificaci|ingenier|arquitect/.test(t)) return "Construcción";
  if (/transport|logist|carga|flet|paqueter|mudanz|distribuidora/.test(t)) return "Transporte y logística";
  if (/agric|agro|aliment|granja|pecuari|ganader|cosech/.test(t)) return "Agroindustria";
  if (/turism|hotel|viaje|tour|resort|hosped/.test(t)) return "Turismo";
  if (/comerci|distribu|abarrot|retail|mayoreo|ferreter/.test(t)) return "Comercio y distribución";
  if (/miner|mina|extrac|acero|metalurg/.test(t)) return "Minería";
  if (/servicio|consult|tecnolog|software|sistemas|despacho/.test(t)) return "Servicios";
  return null;
}
function sectorWeaknesses(sector: string | null): string[] {
  switch (sector) {
    case "Construcción":
      return ["Flota propia ociosa entre proyectos", "Altos costos de mantenimiento de vehículos pesados"];
    case "Transporte y logística":
      return ["Picos de demanda difíciles de cubrir con flota fija", "Vehículos viejos elevan costos y fallas"];
    case "Agroindustria":
      return ["Estacionalidad de la operación", "Distancias largas a zonas rurales"];
    case "Minería":
      return ["Operación en zonas remotas y exigentes", "Alta exigencia de disponibilidad de unidades"];
    default:
      return ["Posible flota propia con costos fijos altos", "Necesidad de flexibilidad operativa"];
  }
}
function sectorOpportunities(sector: string | null): string[] {
  switch (sector) {
    case "Construcción":
      return ["Renta de pick-ups 4x4 y camiones por duración de obra", "Flota escalable sin inmovilizar capital"];
    case "Transporte y logística":
      return ["Refuerzo de flota en temporada alta", "Sustitución de unidades viejas sin compra"];
    case "Minería":
      return ["Unidades robustas con mantenimiento garantizado en sitio", "Disponibilidad asegurada de reemplazo"];
    default:
      return ["Renta flexible adaptada a su operación", "Mantenimiento y seguro incluidos"];
  }
}
function sectorFleet(sector: string | null): string {
  switch (sector) {
    case "Construcción":
      return "Pick-ups 4x4, camiones de carga y de volteo ligero";
    case "Transporte y logística":
      return "Vans de carga, camiones 3.5T y tractocamiones ligeros";
    case "Turismo":
      return "Vans de pasajeros y SUVs";
    case "Minería":
      return "Pick-ups 4x4 reforzadas y unidades de personal";
    default:
      return "Sedanes, SUVs y vans según necesidad";
  }
}
