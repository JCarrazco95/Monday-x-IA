import { structuredCompletion, MODEL_HEAVY, isMockMode } from "../lib/claude.js";
import { logActivity } from "../lib/activityLog.js";
import { db } from "../db/index.js";
import { safeParseJson } from "../lib/references.js";
import type {
  CallIntelligenceInput,
  CallIntelligenceOutput,
  ChallengerAnalysis,
  SandlerAnalysis,
  SandlerStage,
  IntegratedAnalysis,
  SellerAnalysis,
  DeepCallAnalysis,
  UpsellAnalysis,
  UpsellSignal
} from "./types.js";

export const AGENT_ID = "call_intelligence";

// Las 7 etapas del Sistema Sandler con su ponderacion (suman 100).
const SANDLER_ETAPAS: { id: number; nombre: string; peso: number }[] = [
  { id: 1, nombre: "Vinculo y Confianza", peso: 12 },
  { id: 2, nombre: "Contrato Previo (Up-Front)", peso: 13 },
  { id: 3, nombre: "Dolor (Pain)", peso: 25 },
  { id: 4, nombre: "Presupuesto (Budget)", peso: 18 },
  { id: 5, nombre: "Decision", peso: 17 },
  { id: 6, nombre: "Cierre / Cumplimiento", peso: 10 },
  { id: 7, nombre: "Post-Venta", peso: 5 }
];

// ─── Sandler (analisis detallado por etapas) ──────────────────────────────────
const SANDLER_SYSTEM = `Eres un coach de ventas experto en el SISTEMA SANDLER que evalua una llamada B2B
de MAXIRent (renta de flotillas en Mexico). Analiza la transcripcion etapa por etapa del
"submarino" Sandler y se exigente y especifico, citando evidencia textual.

Las 7 etapas y su ponderacion (suman 100):
1. Vinculo y Confianza (12): rapport honesto, tono de igual a igual, sin adulacion ni "modo vendedor".
2. Contrato Previo / Up-Front Contract (13): acordar agenda, tiempo, objetivo y "derecho a decir no" al inicio.
3. Dolor / Pain (25) [LA MAS IMPORTANTE]: descubrir el dolor real con preguntas; profundizar (3 niveles), impacto personal y de negocio. No vender features.
4. Presupuesto / Budget (18): hablar de dinero sin rodeos; capacidad y disposicion a invertir; costo de no resolver.
5. Decision (17): entender el proceso de decision (quien, como, cuando, criterios, competencia).
6. Cierre / Cumplimiento (10): presentar solo lo que resuelve el dolor; pedir el compromiso; siguiente paso fechado.
7. Post-Venta (5): blindar la venta, expectativas, evitar remordimiento del comprador.

Para CADA etapa da: puntaje 0-100, estado (cumplida|parcial|deficiente|no_aplica), aciertos, fallos y evidencia (citas textuales con hablante).
"puntajeFinal" = promedio ponderado por peso (0-100). banda: verde >=75, amarillo 50-74, rojo <50.
Tambien extrae los basicos: resumen ejecutivo, vehiculos, fechas, compromisos, objeciones, sentimiento (positivo|neutro|negativo) y probabilidad de cierre (alta|media|baja).
No inventes hechos fuera de la transcripcion. Responde con la herramienta "sandler_result".`;

const SANDLER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    resumen: { type: "string" },
    vehiculosMencionados: { type: "array", items: { type: "string" } },
    fechasMencionadas: { type: "array", items: { type: "string" } },
    compromisos: {
      type: "array",
      items: {
        type: "object",
        properties: { descripcion: { type: "string" }, responsable: { type: "string" }, fecha: { type: "string" } },
        required: ["descripcion", "responsable"]
      }
    },
    objeciones: { type: "array", items: { type: "string" } },
    sentimiento: { type: "string", enum: ["positivo", "neutro", "negativo"] },
    probabilidadCierre: { type: "string", enum: ["alta", "media", "baja"] },
    sandler: {
      type: "object",
      properties: {
        puntajeFinal: { type: "number" },
        banda: { type: "string", enum: ["rojo", "amarillo", "verde"] },
        etapas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number" },
              nombre: { type: "string" },
              peso: { type: "number" },
              puntaje: { type: "number" },
              estado: { type: "string", enum: ["cumplida", "parcial", "deficiente", "no_aplica"] },
              aciertos: { type: "array", items: { type: "string" } },
              fallos: { type: "array", items: { type: "string" } },
              evidencia: {
                type: "array",
                items: {
                  type: "object",
                  properties: { cita: { type: "string" }, hablante: { type: "string" }, marcaTiempo: { type: "string" } },
                  required: ["cita"]
                }
              }
            },
            required: ["id", "nombre", "peso", "puntaje", "estado", "aciertos", "fallos", "evidencia"]
          }
        },
        fortalezas: { type: "array", items: { type: "string" } },
        areasMejora: { type: "array", items: { type: "string" } },
        recomendaciones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prioridad: { type: "string", enum: ["alta", "media", "baja"] },
              etapa: { type: "string" },
              accion: { type: "string" },
              ejemploFrase: { type: "string" }
            },
            required: ["prioridad", "accion"]
          }
        },
        momentoClave: { type: "string" }
      },
      required: ["puntajeFinal", "banda", "etapas", "fortalezas", "areasMejora", "recomendaciones"]
    }
  },
  required: ["resumen", "vehiculosMencionados", "fechasMencionadas", "compromisos", "objeciones", "sentimiento", "probabilidadCierre", "sandler"]
};

// ─── Challenger Sale ──────────────────────────────────────────────────────────
const CHALLENGER_SYSTEM = `Eres un coach de ventas que evalua una llamada B2B de MAXIRent (renta de flotillas)
bajo el metodo CHALLENGER SALE (Teach, Tailor, Take Control + Commercial Insight + Reframe).
Asigna puntos por criterio (suma 100) y devuelve el desglose con justificacion:
- Teach — Commercial Insight (0-25): aporto una idea que reta el statu quo del cliente?
- Reframe (0-15): reencuadro el problema hacia una nueva dimension de valor?
- Tailor (0-20): adapto el mensaje al rol e industria del interlocutor?
- Take Control (0-20): hablo de dinero, manejo objeciones y presiono por compromisos?
- Constructive Tension (0-10): genero tension sana sin caer en venta pasiva?
- Next Step / Commitment (0-10): cerro con un siguiente paso claro y fechado?
El "score" es la suma exacta del desglose. banda: verde >=75, amarillo 50-74, rojo <50.
Clasifica el "perfilVendedor": challenger | hard_worker | lone_wolf | relationship_builder | reactive_problem_solver.
Da "insightSugerido" (idea comercial para retar al cliente), "reframeSugerido" y "siguientePaso".
No inventes hechos que no esten en la transcripcion. Responde con la herramienta "challenger_result".`;

const CHALLENGER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    banda: { type: "string", enum: ["rojo", "amarillo", "verde"] },
    perfilVendedor: {
      type: "string",
      enum: ["challenger", "hard_worker", "lone_wolf", "relationship_builder", "reactive_problem_solver"]
    },
    dimensiones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          criterio: { type: "string" },
          puntos: { type: "number" },
          max: { type: "number" },
          justificacion: { type: "string" }
        },
        required: ["criterio", "puntos", "max", "justificacion"]
      }
    },
    fortalezas: { type: "array", items: { type: "string" } },
    areasMejora: { type: "array", items: { type: "string" } },
    insightSugerido: { type: "string" },
    reframeSugerido: { type: "string" },
    siguientePaso: { type: "string" }
  },
  required: ["score", "banda", "perfilVendedor", "dimensiones", "fortalezas", "areasMejora", "insightSugerido", "reframeSugerido", "siguientePaso"]
};

// ─── Integrado (fusion de ambos modelos) ──────────────────────────────────────
const INTEGRADO_SYSTEM = `Eres el director comercial de MAXIRent. Recibes dos evaluaciones de la MISMA llamada:
una bajo SANDLER (mecanica de la venta: rapport, dolor, presupuesto, decision, cierre) y otra bajo
CHALLENGER SALE (capacidad de retar al cliente con un insight comercial). Tu trabajo es FUSIONARLAS en
un unico analisis potenciado y accionable para coaching del vendedor.

Devuelve:
- scoreGlobal (0-100): vision ponderada de ambos modelos (Sandler ~55%, Challenger ~45%).
- banda: verde >=75, amarillo 50-74, rojo <50.
- resumenEjecutivo: 4-6 lineas que combinan lo mejor de ambos diagnosticos (potenciado, no repetitivo).
- diagnostico: como se complementan/contradicen ambos modelos en esta llamada concreta.
- fortalezasClave y riesgos (los mas importantes de ambos modelos, sin duplicar).
- planAccion: 3-5 acciones priorizadas (alta|media|baja) que mezclan tecnica Sandler y reto Challenger.
- proximaLlamada: objetivo concreto + un "up-front contract" sugerido para la siguiente llamada.
Responde con la herramienta "integrado_result".`;

const INTEGRADO_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    scoreGlobal: { type: "number", minimum: 0, maximum: 100 },
    banda: { type: "string", enum: ["rojo", "amarillo", "verde"] },
    resumenEjecutivo: { type: "string" },
    diagnostico: { type: "string" },
    fortalezasClave: { type: "array", items: { type: "string" } },
    riesgos: { type: "array", items: { type: "string" } },
    planAccion: {
      type: "array",
      items: {
        type: "object",
        properties: { prioridad: { type: "string", enum: ["alta", "media", "baja"] }, accion: { type: "string" } },
        required: ["prioridad", "accion"]
      }
    },
    proximaLlamada: { type: "string" }
  },
  required: ["scoreGlobal", "banda", "resumenEjecutivo", "diagnostico", "fortalezasClave", "riesgos", "planAccion", "proximaLlamada"]
};


// ─── Coaching del vendedor + analisis profundo de la llamada ──────────────────
interface CoachingResult { vendedor: SellerAnalysis; analisisProfundo: DeepCallAnalysis; }

const COACHING_SYSTEM = `Eres un coach senior de ventas de MAXIRent. A partir de la transcripcion de una llamada
(y de los analisis Sandler y Challenger ya hechos) produce un analisis PROFUNDO y especifico, en dos partes:

A) "vendedor" (coaching del vendedor):
 - desempenoGeneral: valoracion narrativa honesta (4-6 lineas).
 - puntosClave: 3-6 cosas concretas que el vendedor HIZO BIEN (con detalle, no genericas).
 - fallos: 3-6 errores concretos, cada uno con su IMPACTO en la venta (y momento si aplica).
 - mejoras: 3-6 acciones de mejora priorizadas (alta|media|baja), con area y una "ejemploFrase" lista para usar.
 - habilidades: evalua 0-100 estas 6: "Escucha activa", "Descubrimiento/Preguntas", "Manejo de objeciones",
   "Comunicacion/Claridad", "Control y cierre", "Conocimiento del producto"; cada una con un comentario breve.
 - estiloComunicacion: descripcion del estilo (consultivo, presionado, pasivo, etc.).
 - ratioHablaEscucha: estimacion (ej "65% vendedor / 35% cliente").

B) "analisisProfundo" (toda la llamada):
 - resumenDetallado: narrativa extensa (6-10 lineas) de como transcurrio la llamada.
 - momentos: linea de tiempo de momentos clave {titulo, detalle, tipo positivo|negativo|neutro, marcaTiempo?}.
 - temasTratados, necesidadesCliente, senalesCompra, banderasRojas: listas concretas.
 - citasDestacadas: 2-5 citas textuales importantes {cita, hablante, porque es relevante}.

No inventes hechos fuera de la transcripcion. Se concreto y accionable. Responde con la herramienta "coaching_result".`;

const COACHING_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    vendedor: {
      type: "object",
      properties: {
        desempenoGeneral: { type: "string" },
        puntosClave: { type: "array", items: { type: "string" } },
        fallos: {
          type: "array",
          items: {
            type: "object",
            properties: { descripcion: { type: "string" }, impacto: { type: "string" }, momento: { type: "string" } },
            required: ["descripcion", "impacto"]
          }
        },
        mejoras: {
          type: "array",
          items: {
            type: "object",
            properties: {
              area: { type: "string" },
              accion: { type: "string" },
              ejemploFrase: { type: "string" },
              prioridad: { type: "string", enum: ["alta", "media", "baja"] }
            },
            required: ["area", "accion", "prioridad"]
          }
        },
        habilidades: {
          type: "array",
          items: {
            type: "object",
            properties: { nombre: { type: "string" }, puntaje: { type: "number" }, comentario: { type: "string" } },
            required: ["nombre", "puntaje", "comentario"]
          }
        },
        estiloComunicacion: { type: "string" },
        ratioHablaEscucha: { type: "string" }
      },
      required: ["desempenoGeneral", "puntosClave", "fallos", "mejoras", "habilidades", "estiloComunicacion"]
    },
    analisisProfundo: {
      type: "object",
      properties: {
        resumenDetallado: { type: "string" },
        momentos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              detalle: { type: "string" },
              tipo: { type: "string", enum: ["positivo", "negativo", "neutro"] },
              marcaTiempo: { type: "string" }
            },
            required: ["titulo", "detalle", "tipo"]
          }
        },
        temasTratados: { type: "array", items: { type: "string" } },
        necesidadesCliente: { type: "array", items: { type: "string" } },
        senalesCompra: { type: "array", items: { type: "string" } },
        banderasRojas: { type: "array", items: { type: "string" } },
        citasDestacadas: {
          type: "array",
          items: {
            type: "object",
            properties: { cita: { type: "string" }, hablante: { type: "string" }, porque: { type: "string" } },
            required: ["cita", "hablante", "porque"]
          }
        }
      },
      required: ["resumenDetallado", "momentos", "temasTratados", "necesidadesCliente", "senalesCompra", "banderasRojas", "citasDestacadas"]
    }
  },
  required: ["vendedor", "analisisProfundo"]
};

// ─── Oportunidades comerciales (upsell / cross-sell) ──────────────────────────
const UPSELL_SYSTEM = `Eres el director comercial de MAXIRent (renta de flotillas en Mexico). A partir de la transcripcion de
una llamada, detecta OPORTUNIDADES DE CRECIMIENTO de la cuenta (upsell / cross-sell) que el vendedor deberia capitalizar.
Busca senales de:
- expansion_flota: el cliente menciona crecimiento, mas proyectos, mas personal o mas rutas => necesita MAS unidades.
- renovacion_proxima: contrato o renta por vencer, fin de obra/temporada => oportunidad de renovar o extender.
- vehiculo_adicional: necesita un TIPO de vehiculo distinto al cotizado (p.ej. pidio pickup pero habla de carga/pasaje).
- upgrade_unidad: requiere una unidad de mayor categoria/capacidad (4x4, doble cabina, mayor tonelaje, blindaje).
- servicio_adicional: GPS/telemetria, mantenimiento, seguro ampliado, conductor, sustitucion, rotulado, etc.
Para CADA senal real da: tipo, descripcion, evidencia (cita textual), vehiculoSugerido (que ofrecer), potencial (alto|medio|bajo) y accionSugerida concreta.
Se RIGUROSO: solo senales con sustento en la transcripcion. Si no hay oportunidad clara, devuelve hayOportunidad=false y senales=[].
"ingresoIncrementalEstimado": texto breve del tamano de la oportunidad (ej "+2-3 unidades, ~30% del contrato"). No inventes cifras exactas.
Responde con la herramienta "upsell_result".`;

const UPSELL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    hayOportunidad: { type: "boolean" },
    resumen: { type: "string" },
    ingresoIncrementalEstimado: { type: "string" },
    senales: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["expansion_flota", "renovacion_proxima", "vehiculo_adicional", "upgrade_unidad", "servicio_adicional"]
          },
          descripcion: { type: "string" },
          evidencia: { type: "string" },
          vehiculoSugerido: { type: "string" },
          potencial: { type: "string", enum: ["alto", "medio", "bajo"] },
          accionSugerida: { type: "string" }
        },
        required: ["tipo", "descripcion", "potencial", "accionSugerida"]
      }
    }
  },
  required: ["hayOportunidad", "resumen", "senales"]
};

// Exportado para pruebas: umbral de banda y catálogo de etapas Sandler.
export const banda = (s: number): "rojo" | "amarillo" | "verde" => (s >= 75 ? "verde" : s >= 50 ? "amarillo" : "rojo");
export { SANDLER_ETAPAS };

type SandlerPass = Omit<CallIntelligenceOutput, "challenger" | "integrado"> & { sandler: SandlerAnalysis };

// ===== Pasadas CONSOLIDADAS (2 en lugar de 5) para reducir consumo de tokens =====
// Misma salida que antes (no cambia el frontend ni coaching/forecast/upsell), pero
// deja de re-enviar la transcripcion 5 veces: ahora solo 2 llamadas a la IA.
//   Pasada 1: Sandler + Challenger + Integrado + basicos.
//   Pasada 2: Coaching del vendedor + analisis profundo + oportunidades.

const VENTA_SYSTEM = `${SANDLER_SYSTEM}

================ ADEMAS, EN LA MISMA RESPUESTA, EVALUA CHALLENGER ================
${CHALLENGER_SYSTEM}

================ Y FUSIONA AMBOS MODELOS EN "integrado" ================
${INTEGRADO_SYSTEM}

REGLA FINAL: entrega UNA sola respuesta con la herramienta "venta_result" que contenga los basicos, "sandler", "challenger" e "integrado".`;

const VENTA_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    ...(SANDLER_SCHEMA.properties as Record<string, unknown>),
    challenger: CHALLENGER_SCHEMA,
    integrado: INTEGRADO_SCHEMA
  },
  required: [...(SANDLER_SCHEMA.required as string[]), "challenger", "integrado"]
};

const COACH_OPS_SYSTEM = `${COACHING_SYSTEM}

================ ADEMAS, EN LA MISMA RESPUESTA, DETECTA OPORTUNIDADES ================
${UPSELL_SYSTEM}

REGLA FINAL: entrega UNA sola respuesta con la herramienta "coaching_oportunidades_result" con las claves "vendedor", "analisisProfundo" y "oportunidades".`;

const COACH_OPS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    ...(COACHING_SCHEMA.properties as Record<string, unknown>),
    oportunidades: UPSELL_SCHEMA
  },
  required: ["vendedor", "analisisProfundo", "oportunidades"]
};

type VentaPass = SandlerPass & { challenger: ChallengerAnalysis; integrado: IntegratedAnalysis };
type CoachOpsResult = CoachingResult & { oportunidades: UpsellAnalysis };

function mockVenta(input: CallIntelligenceInput): VentaPass {
  const s = mockSandler(input);
  const ch = mockChallenger(input);
  return { ...s, challenger: ch, integrado: mockIntegrado(s.sandler, ch) };
}

function mockCoachOps(
  input: CallIntelligenceInput,
  sandler: SandlerAnalysis,
  challenger: ChallengerAnalysis
): CoachOpsResult {
  const c = mockCoaching(input, sandler, challenger);
  return { vendedor: c.vendedor, analisisProfundo: c.analisisProfundo, oportunidades: mockUpsell(input) };
}

// Pasada 1 — Sandler + Challenger + Integrado + basicos (una sola llamada a la IA).
async function runVenta(input: CallIntelligenceInput): Promise<VentaPass> {
  return structuredCompletion<VentaPass>({
    system: VENTA_SYSTEM,
    model: MODEL_HEAVY,
    prompt: `Item de Monday: ${input.itemName} (ID: ${input.itemId})

Transcripcion de la llamada:
"""
${input.transcript}
"""

Evalua la llamada con Sandler (7 etapas), Challenger (6 dimensiones) y la fusion Integrada, y extrae los basicos. Todo en una sola respuesta.`,
    toolName: "venta_result",
    toolDescription: "Analisis de la llamada: Sandler + Challenger + Integrado + basicos.",
    inputSchema: VENTA_SCHEMA,
    mockFn: () => mockVenta(input)
  });
}

// Pasada 2 — coaching del vendedor + analisis profundo + oportunidades (una sola llamada).
async function runCoachingOps(
  input: CallIntelligenceInput,
  sandler: SandlerAnalysis,
  challenger: ChallengerAnalysis
): Promise<CoachOpsResult> {
  return structuredCompletion<CoachOpsResult>({
    system: COACH_OPS_SYSTEM,
    model: MODEL_HEAVY,
    prompt: `Llamada: ${input.itemName} (ID: ${input.itemId})

Transcripcion:
"""
${input.transcript}
"""

== Sandler (JSON) ==
${JSON.stringify(sandler)}

== Challenger (JSON) ==
${JSON.stringify(challenger)}

Genera el coaching del vendedor, el analisis profundo de la llamada y las oportunidades de upsell/cross-sell. Todo en una sola respuesta.`,
    toolName: "coaching_oportunidades_result",
    toolDescription: "Coaching del vendedor + analisis profundo + oportunidades.",
    inputSchema: COACH_OPS_SCHEMA,
    mockFn: () => mockCoachOps(input, sandler, challenger)
  });
}

// Caché de análisis: si ya existe un análisis para este itemId en la bitácora,
// se reutiliza en vez de volver a gastar 2 llamadas a la IA (webhooks/sync
// repetidos de la misma llamada). Se puede desactivar con CALL_ANALYSIS_CACHE=false.
const CALL_CACHE_ENABLED = process.env.CALL_ANALYSIS_CACHE !== "false";

async function findCachedAnalysis(itemId: string): Promise<CallIntelligenceOutput | null> {
  if (!CALL_CACHE_ENABLED) return null;
  try {
    const row = await db.queryOne<{ payload: string }>(
      `SELECT payload FROM logs
         WHERE agent_id = '${AGENT_ID}' AND payload IS NOT NULL AND reference LIKE ?
         ORDER BY timestamp DESC, id DESC LIMIT 1`,
      [`#${itemId} ·%`]
    );
    const cached = row?.payload ? safeParseJson<CallIntelligenceOutput>(row.payload) : null;
    // Solo se reutilizan análisis hechos con IA REAL. Un análisis "fallback"
    // (la IA falló y se usaron heurísticas) o "demo" debe re-analizarse cuando
    // el proveedor vuelva a estar disponible, no quedarse pegado para siempre.
    if (cached && cached.fuenteAnalisis === "ia") return cached;
    return null;
  } catch {
    return null;
  }
}

export async function runCallIntelligenceAgent(
  input: CallIntelligenceInput
): Promise<CallIntelligenceOutput> {
  // Reutiliza un análisis previo de esta misma llamada (ahorra 2 llamadas a la IA).
  const cached = await findCachedAnalysis(input.itemId);
  if (cached) return cached;

  // Procedencia: "demo" en modo demo declarado, "ia" con proveedor real.
  //
  // REGLA (modo live): si la IA falla tras los reintentos, el análisis FALLA —
  // NO se guardan heurísticas. Un resultado heurístico mezclado con datos
  // reales contamina el board/coaching/pipeline y hay que purgarlo después;
  // es mejor que la llamada quede pendiente y el próximo sync la reintente.
  // Las heurísticas (mocks) solo se usan en modo demo declarado.
  const fuenteAnalisis: CallIntelligenceOutput["fuenteAnalisis"] = isMockMode ? "demo" : "ia";

  const fallar = (etapa: string, err: unknown): never => {
    const msg = err instanceof Error ? err.message : String(err);
    logActivity({
      agentId: AGENT_ID,
      type: "error",
      title: "Análisis de llamada NO completado (IA no disponible)",
      detail: `Falló la ${etapa} tras los reintentos. La llamada queda pendiente para el próximo sync. ${msg.slice(0, 300)}`,
      reference: `#${input.itemId} · ${input.itemName}`
    });
    throw new Error(`IA no disponible (${etapa}): ${msg.slice(0, 200)}`);
  };

  // Pasada 1: Sandler + Challenger + Integrado + basicos (1 llamada a la IA).
  let venta: VentaPass;
  try {
    venta = await runVenta(input);
  } catch (err) {
    if (!isMockMode) fallar("pasada de venta (Sandler/Challenger)", err);
    venta = mockVenta(input);
  }

  // Pasada 2: coaching + analisis profundo + oportunidades (1 llamada a la IA).
  let coachOps: CoachOpsResult;
  try {
    coachOps = await runCoachingOps(input, venta.sandler, venta.challenger);
  } catch (err) {
    if (!isMockMode) fallar("pasada de coaching/oportunidades", err);
    coachOps = mockCoachOps(input, venta.sandler, venta.challenger);
  }

  const { challenger, integrado, ...sandlerBasics } = venta;
  return {
    ...sandlerBasics,
    telefono: input.telefono ?? null,
    vendedorNombre: input.vendedor ?? null,
    challenger,
    integrado,
    vendedor: coachOps.vendedor,
    analisisProfundo: coachOps.analisisProfundo,
    oportunidades: coachOps.oportunidades,
    fuenteAnalisis
  };
}

// ===================== Modo demo (sin IA) — mocks ricos =====================
function detectar(text: string) {
  const t = text.toLowerCase();
  return {
    negativo: /caro|costoso|no me convence|muy alto|cancelar|caro\b/.test(t),
    positivo: /perfecto|de acuerdo|me interesa|adelante|excelente|muchisimo/.test(t),
    dolor: /problema|necesito|urgente|se nos|nos cuesta|fallas|tiempo muerto/.test(t),
    dinero: /precio|presupuesto|costo|cotizacion|descuento|pagar|inversion/.test(t),
    cierre: /jueves|viernes|lunes|reunion|agendemos|agenda|finanzas|cita/.test(t),
    insight: /flota propia|capital|mantenimiento|comparativo|30%|costo total/.test(t)
  };
}

function mockSandler(input: CallIntelligenceInput): SandlerPass {
  const text = input.transcript.toLowerCase();
  const d = detectar(text);
  const base = d.positivo ? 76 : d.negativo ? 44 : 60;
  const vehiculos = ["pickup", "van", "suv", "sedan", "camion"].filter((v) => text.includes(v));

  const sub: Record<number, number> = {
    1: Math.min(100, base + 8),                 // rapport
    2: Math.max(20, base - 25),                 // up-front contract (suele fallar)
    3: d.dolor ? Math.min(100, base + 5) : Math.max(25, base - 20), // dolor
    4: d.dinero ? base : Math.max(25, base - 18),                   // presupuesto
    5: Math.max(20, base - 15),                 // decision
    6: d.cierre ? Math.min(100, base + 6) : Math.max(25, base - 22),// cierre
    7: 40                                        // post-venta (casi nunca se hace)
  };
  const estado = (p: number) => (p >= 75 ? "cumplida" : p >= 50 ? "parcial" : "deficiente") as SandlerStage["estado"];
  const etapas: SandlerStage[] = SANDLER_ETAPAS.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    peso: e.peso,
    puntaje: sub[e.id],
    estado: estado(sub[e.id]),
    aciertos:
      sub[e.id] >= 60
        ? [`Se trabajo la etapa "${e.nombre}" de forma aceptable.`]
        : [],
    fallos:
      sub[e.id] < 60
        ? [`Falto profundizar en "${e.nombre}" (modo demo, sin IA).`]
        : [],
    evidencia: []
  }));
  const puntajeFinal = Math.round(etapas.reduce((s, e) => s + e.peso * e.puntaje, 0) / 100);

  return {
    resumen: `Llamada con ${input.itemName}. Se discutio disponibilidad y condiciones de renta. (resumen demo)`,
    vehiculosMencionados: vehiculos.length ? vehiculos : ["pickup doble cabina"],
    fechasMencionadas: text.includes("julio") ? ["julio"] : d.cierre ? ["proxima semana"] : [],
    compromisos: [{ descripcion: "Enviar cotizacion formal por correo", responsable: "Vendedor", fecha: "Proximas 24 horas" }],
    objeciones: d.negativo ? ["El precio se percibe alto frente a la competencia"] : [],
    sentimiento: d.negativo ? "negativo" : d.positivo ? "positivo" : "neutro",
    probabilidadCierre: d.positivo ? "alta" : d.negativo ? "baja" : "media",
    sandler: {
      puntajeFinal,
      banda: banda(puntajeFinal),
      etapas,
      fortalezas: d.positivo ? ["Buen rapport inicial", "Avanzo la conversacion"] : ["Mantuvo el contacto con el cliente"],
      areasMejora: ["Establecer un Up-Front Contract al inicio", "Profundizar el Dolor (3 niveles)", "Hablar de presupuesto sin rodeos"],
      recomendaciones: [
        { prioridad: "alta", etapa: "Dolor (Pain)", accion: "Hacer 3 preguntas de profundizacion del dolor antes de cotizar.", ejemploFrase: "Cuando dice que es caro, ¿que pasa hoy en su operacion que lo hace urgente resolverlo?" },
        { prioridad: "media", etapa: "Contrato Previo (Up-Front)", accion: "Acordar agenda y objetivo al inicio de la proxima llamada." }
      ],
      momentoClave: "El cliente expresa interes pero no se descubrio el dolor real ni el presupuesto."
    }
  };
}

function mockChallenger(input: CallIntelligenceInput): ChallengerAnalysis {
  const d = detectar(input.transcript.toLowerCase());
  const base = d.positivo ? 78 : d.negativo ? 42 : 60;
  const f = base / 100;
  const dim = (criterio: string, max: number, factor = f) => ({
    criterio,
    max,
    puntos: Math.round(max * factor),
    justificacion: "Estimacion en modo demo (sin IA). Conecta un proveedor de IA para el analisis real."
  });
  const dimensiones = [
    dim("Teach — Commercial Insight", 25, (d.insight ? 0.8 : 0.5) * f * 1.1),
    dim("Reframe", 15, f * 0.8),
    dim("Tailor", 20),
    dim("Take Control", 20, (d.dinero ? 0.95 : 0.7) * f * 1.05),
    dim("Constructive Tension", 10, f * 0.8),
    dim("Next Step / Commitment", 10, d.cierre ? f : f * 0.6)
  ];
  const score = Math.max(0, Math.min(100, dimensiones.reduce((s, x) => s + x.puntos, 0)));
  return {
    score,
    banda: banda(score),
    perfilVendedor: score >= 75 ? "challenger" : score >= 50 ? "hard_worker" : "relationship_builder",
    dimensiones,
    fortalezas: d.positivo ? ["Genero interes y avanzo la conversacion"] : ["Mantuvo el contacto con el cliente"],
    areasMejora: ["Aportar un insight que rete el statu quo del cliente", "Reencuadrar hacia el costo total de movilidad"],
    insightSugerido: "Mostrar el costo real de mantener flota propia vs. renta (capital inmovilizado + mantenimiento).",
    reframeSugerido: "Pasar de \"rentar autos\" a \"optimizar el costo total de movilidad y liberar capital\".",
    siguientePaso: "Agendar reunion con el area de finanzas/compras con un comparativo de costos en 3 dias."
  };
}

function mockIntegrado(sandler: SandlerAnalysis, challenger: ChallengerAnalysis): IntegratedAnalysis {
  const scoreGlobal = Math.round(sandler.puntajeFinal * 0.55 + challenger.score * 0.45);
  return {
    scoreGlobal,
    banda: banda(scoreGlobal),
    resumenEjecutivo:
      `La llamada muestra una mecanica Sandler de ${sandler.puntajeFinal}/100 y un reto comercial Challenger de ${challenger.score}/100. ` +
      `El vendedor ${sandler.puntajeFinal >= 60 ? "construye relacion y avanza" : "aun no descubre el dolor real"}, ` +
      `y ${challenger.score >= 60 ? "empieza a aportar perspectiva" : "no reta el statu quo del cliente"}. ` +
      `El mayor apalancamiento es unir el descubrimiento del dolor (Sandler) con un insight comercial (Challenger).`,
    diagnostico:
      "Sandler aporta el 'como' (rapport, dolor, presupuesto, cierre) y Challenger el 'que' (la idea que cambia la conversacion). " +
      "En esta llamada ambos coinciden en que falta profundidad: sin dolor cuantificado, el insight no aterriza y el cierre se debilita.",
    fortalezasClave: [...sandler.fortalezas.slice(0, 2), ...challenger.fortalezas.slice(0, 1)],
    riesgos: [
      "Cotizar antes de descubrir y cuantificar el dolor.",
      "Competir por precio en vez de por costo total de movilidad."
    ],
    planAccion: [
      { prioridad: "alta", accion: "Profundizar el dolor (3 niveles) y cuantificarlo en $ antes de cotizar (Sandler)." },
      { prioridad: "alta", accion: "Entregar un comparativo flota propia vs. renta como Commercial Insight (Challenger)." },
      { prioridad: "media", accion: "Cerrar con un Up-Front Contract para la proxima llamada (objetivo + decisores)." }
    ],
    proximaLlamada:
      "Objetivo: validar el costo total de movilidad con finanzas. Up-front: 'En 20 min revisamos el comparativo; si hace sentido definimos piloto, si no, me lo dice con confianza.'"
  };
}

function mockCoaching(
  input: CallIntelligenceInput,
  sandler: SandlerAnalysis,
  challenger: ChallengerAnalysis
): CoachingResult {
  const d = detectar(input.transcript.toLowerCase());
  const bien = d.positivo || sandler.puntajeFinal >= 60;
  const habil = (nombre: string, base: number, c: string) => ({
    nombre,
    puntaje: Math.max(20, Math.min(100, base)),
    comentario: c
  });
  const f = bien ? 10 : -10;
  return {
    vendedor: {
      desempenoGeneral:
        `El vendedor ${bien ? "construye buena relacion y mantiene el control de la conversacion" : "es cordial pero reacciona en vez de dirigir la llamada"}. ` +
        `${d.dolor ? "Detecta senales de dolor" : "No profundiza en el dolor del cliente"} y ${d.dinero ? "aborda el tema economico" : "evita hablar de presupuesto"}. ` +
        `Su mayor area de crecimiento es convertir el interes en compromisos concretos y aportar un insight que cambie la conversacion. (valoracion demo)`,
      puntosClave: [
        bien ? "Tono profesional y cercano; genera confianza rapido." : "Mantiene la cortesia incluso ante objeciones.",
        d.cierre ? "Propone un siguiente paso con fecha." : "Cierra la llamada de forma ordenada.",
        d.dolor ? "Hace preguntas para entender la necesidad." : "Escucha sin interrumpir al cliente."
      ],
      fallos: [
        { descripcion: "No establece un Up-Front Contract al inicio.", impacto: "La llamada avanza sin objetivo claro y se diluye el cierre.", momento: "Apertura" },
        { descripcion: d.dolor ? "Profundiza poco en el dolor (se queda en el sintoma)." : "No descubre el dolor real del cliente.", impacto: "Sin dolor cuantificado, el precio se percibe alto y la propuesta pierde fuerza." },
        { descripcion: d.dinero ? "Habla de descuento antes de validar valor." : "Evita la conversacion de presupuesto.", impacto: "Compite por precio en vez de por valor/costo total." }
      ],
      mejoras: [
        { area: "Descubrimiento (Dolor)", accion: "Aplicar 3 niveles de profundizacion antes de cotizar.", ejemploFrase: "Cuando dice que es caro, ¿que esta pasando hoy en su operacion que lo hace urgente resolverlo?", prioridad: "alta" },
        { area: "Insight comercial", accion: "Presentar el comparativo flota propia vs. renta como ensenanza.", ejemploFrase: "Le comparto un dato: mantener flota propia inmoviliza ~30% mas de capital al ano.", prioridad: "alta" },
        { area: "Control y cierre", accion: "Cerrar siempre con un Up-Front Contract para la proxima llamada.", ejemploFrase: "Acordemos: en 20 min revisamos el comparativo y decidimos si avanzamos o no.", prioridad: "media" }
      ],
      habilidades: [
        habil("Escucha activa", 60 + f, bien ? "Deja hablar al cliente y retoma sus palabras." : "Interrumpe o no retoma lo que dice el cliente."),
        habil("Descubrimiento/Preguntas", (d.dolor ? 62 : 42) + f, d.dolor ? "Pregunta, pero no profundiza." : "Pocas preguntas de descubrimiento."),
        habil("Manejo de objeciones", (d.negativo ? 50 : 60) + f, "Reconoce la objecion pero la resuelve con descuento."),
        habil("Comunicacion/Claridad", 70 + f, "Mensaje claro y ordenado."),
        habil("Control y cierre", (d.cierre ? 66 : 45) + f, d.cierre ? "Propone siguiente paso." : "El cierre queda abierto."),
        habil("Conocimiento del producto", 72, "Domina el producto y condiciones de renta.")
      ],
      estiloComunicacion: bien ? "Consultivo y cordial, con margen para ser mas retador." : "Reactivo: responde a lo que pide el cliente sin dirigir.",
      ratioHablaEscucha: bien ? "55% vendedor / 45% cliente" : "70% vendedor / 30% cliente"
    },
    analisisProfundo: {
      resumenDetallado:
        `La llamada con ${input.itemName} inicia con saludo y rapport. El cliente expone su interes en ${
          (sandler.etapas.length ? "vehiculos de renta" : "renta")
        } y aparece la objecion de precio. ` +
        `El vendedor ${d.dinero ? "ofrece revisar un descuento" : "no aterriza el tema economico"} y ${
          d.cierre ? "acuerda enviar una cotizacion con fecha" : "no fija un siguiente paso claro"
        }. ` +
        `Sandler ${sandler.puntajeFinal}/100 y Challenger ${challenger.score}/100 coinciden en que falta descubrimiento de dolor e insight comercial. ` +
        `El cliente muestra ${d.positivo ? "interes genuino" : "interes tibio"}; la oportunidad sigue viva si se reencuadra hacia costo total de movilidad. (narrativa demo)`,
      momentos: [
        { titulo: "Apertura y rapport", detalle: "Saludo cordial, sin Up-Front Contract.", tipo: "neutro", marcaTiempo: "00:00" },
        { titulo: "Aparece la objecion de precio", detalle: d.negativo ? "El cliente dice que la cotizacion es cara vs. competencia." : "Se menciona el costo de forma superficial.", tipo: "negativo", marcaTiempo: "01:10" },
        { titulo: d.cierre ? "Acuerdo de siguiente paso" : "Cierre sin compromiso", detalle: d.cierre ? "Se acuerda enviar cotizacion antes del viernes." : "La llamada termina sin fecha concreta.", tipo: d.cierre ? "positivo" : "negativo", marcaTiempo: "03:20" }
      ],
      temasTratados: ["Disponibilidad de unidades", "Precio/cotizacion", d.cierre ? "Siguiente paso" : "Cierre"],
      necesidadesCliente: [d.dolor ? "Resolver un problema operativo urgente" : "Renta de unidades", "Precio competitivo"],
      senalesCompra: d.positivo ? ["Pide cotizacion formal", "Muestra interes en avanzar"] : ["Solicita informacion adicional"],
      banderasRojas: [d.negativo ? "Compara precio con la competencia" : "No define presupuesto", "No se identificaron todos los decisores"],
      citasDestacadas: [
        { cita: d.negativo ? "La cotizacion se ve cara comparada con otras rentadoras." : "Me interesa, mandame la informacion.", hablante: "cliente", porque: d.negativo ? "Objecion central de la llamada; define la estrategia de valor." : "Senal de compra a capitalizar." },
        { cita: d.cierre ? "Te envio la cotizacion actualizada antes del viernes." : "Le marco luego para ver como vamos.", hablante: "vendedor", porque: d.cierre ? "Compromiso concreto con fecha." : "Cierre debil sin compromiso verificable." }
      ]
    }
  };
}

function mockUpsell(input: CallIntelligenceInput): UpsellAnalysis {
  const t = input.transcript.toLowerCase();
  const senales: UpsellSignal[] = [];

  // Heuristicas deterministas sobre palabras clave de la transcripcion.
  if (/\b(\d+)\s*(pickup|pickups|unidad|unidades|camion|camiones|van|vans|auto|autos)\b/.test(t) || /mas unidades|otra unidad|otro vehiculo|sumar|agregar|adicional/.test(t)) {
    senales.push({
      tipo: "expansion_flota",
      descripcion: "El cliente sugiere que necesitaria mas unidades de las cotizadas.",
      evidencia: "Mencion de volumen / unidades adicionales en la llamada.",
      vehiculoSugerido: "Mismo modelo cotizado, paquete por volumen",
      potencial: "alto",
      accionSugerida: "Ofrecer un esquema por volumen con descuento escalonado y reservar disponibilidad."
    });
  }
  if (/expansion|crecer|crecimiento|nuevos proyectos|mas obra|mas rutas|mas personal|temporada alta/.test(t)) {
    senales.push({
      tipo: "expansion_flota",
      descripcion: "Hay senales de crecimiento del negocio que anticipan mayor necesidad de flota.",
      evidencia: "El cliente habla de expansion / nuevos proyectos.",
      vehiculoSugerido: "Plan de flota escalable",
      potencial: "medio",
      accionSugerida: "Proponer un contrato marco que permita escalar unidades segun la demanda."
    });
  }
  if (/vence|renovar|renovacion|termina el contrato|fin de obra|se acaba|prorroga|extender/.test(t)) {
    senales.push({
      tipo: "renovacion_proxima",
      descripcion: "Contrato o renta proximo a vencer: oportunidad de renovar o extender.",
      evidencia: "Mencion de vencimiento / renovacion.",
      potencial: "alto",
      accionSugerida: "Adelantarse al vencimiento con una propuesta de renovacion con mejora de condiciones."
    });
  }
  if (/gps|monitoreo|telemetria|rastreo|localizar|seguro|mantenimiento|conductor|chofer|rotulado/.test(t)) {
    senales.push({
      tipo: "servicio_adicional",
      descripcion: "Interes en servicios de valor agregado (GPS/telemetria, mantenimiento, seguro, conductor).",
      evidencia: "Mencion de servicios complementarios.",
      vehiculoSugerido: "Paquete GPS + mantenimiento incluido",
      potencial: "medio",
      accionSugerida: "Incluir el paquete de telemetria y mantenimiento como cross-sell en la cotizacion."
    });
  }
  if (/4x4|doble cabina|blindaj|mayor capacidad|mas grande|toneladas|carga pesada|refriger/.test(t)) {
    senales.push({
      tipo: "upgrade_unidad",
      descripcion: "El uso descrito sugiere una unidad de mayor categoria/capacidad que la cotizada.",
      evidencia: "Mencion de requerimientos de mayor capacidad/terreno.",
      vehiculoSugerido: "Upgrade a 4x4 / mayor tonelaje",
      potencial: "medio",
      accionSugerida: "Presentar la unidad superior destacando idoneidad para su operacion (TCO, no solo precio)."
    });
  }

  const hayOportunidad = senales.length > 0;
  return {
    hayOportunidad,
    resumen: hayOportunidad
      ? `Se detectaron ${senales.length} oportunidad(es) de crecimiento de la cuenta (modo demo).`
      : "No se detectaron oportunidades claras de upsell/cross-sell en esta llamada (modo demo).",
    ingresoIncrementalEstimado: hayOportunidad ? "Potencial de ampliar el contrato ~20-40%." : null,
    senales
  };
}
