// Tipos compartidos entre agentes

export interface MondayItemRef {
  itemId: string;
  itemName: string;
  boardId?: string;
}

// ---------- Form Analysis Agent (Prioridad 1) ----------
export interface FormAnalysisInput extends MondayItemRef {
  formResponses: Record<string, string>;
}

export interface FormAnalysisOutput {
  vehiculoInteres: string;
  duracionRenta: string;
  tipoCliente: "personal" | "empresarial";
  urgencia: "baja" | "media" | "alta";
  disponibleEnFlota: boolean;
  columnasMonday: Record<string, string>;
  plantillaRespuesta: string;
  resumen: string;
}

// ---------- Lead Enrichment Agent (Prioridad 2) ----------
export interface LeadEnrichmentInput extends MondayItemRef {
  nombre: string;
  email?: string;
  telefono?: string;
  razonSocial?: string;
  rfc?: string;
}

export interface ResearchSource {
  titulo: string;
  url: string;
}

/** Investigacion a fondo de la empresa para potenciar la venta. */
export interface CompanyResearch {
  sectores: string[];
  giroPrincipal?: string | null;
  tamanoEstimado?: string | null;
  ubicacion?: string | null;
  presenciaDigital: {
    web?: { url?: string | null; resumen?: string | null } | null;
    linkedin?: { url?: string | null; resumen?: string | null; perfilContacto?: { nombre: string; puesto?: string | null; url?: string | null; coincideEmpresa: boolean; resumen?: string | null } | null; contactos?: { nombre?: string | null; puesto: string; area?: string | null; url?: string | null }[] } | null;
    redes?: { red: string; url?: string | null; resumen?: string | null }[];
    notas?: string | null;
  };
  debilidades: string[];
  oportunidadesMaxirent: string[];
  necesidadVehicular?: string | null;
  argumentarioVenta: string[];
  rentaOtrasMarcas: {
    detectado: boolean;
    competidores?: string[];
    detalle?: string | null;
  };
  gobierno: {
    tieneContratos: boolean;
    detalle?: string | null;
    fuente?: string | null;
  };
  fuentes: ResearchSource[];
  confianza: "alta" | "media" | "baja";
}

/** Un factor del scoring ponderado, con su justificacion. */
export interface ScoreFactor {
  factor: string;
  puntos: number;
  max: number;
  justificacion: string;
}

export interface LeadEnrichmentOutput {
  score: number;
  scoreBreakdown: ScoreFactor[];
  prioridad: "caliente" | "tibia" | "fria";
  perfilEmpresa: string;
  riesgo: "bajo" | "medio" | "alto";
  accionRecomendada: string;
  siguientesPasos: string[];
  preguntasDiscovery: string[];
  riesgosComerciales: string[];
  resumen: string;
  research?: CompanyResearch | null;
  fuenteAnalisis?: "web" | "modelo" | "demo";
  conocimientoPrevio?: boolean;
  duplicado?: boolean;
  duplicadoRef?: string | null;
}

// ---------- Call Intelligence Agent (Prioridad 3) ----------
export interface CallIntelligenceInput extends MondayItemRef {
  transcript: string;
  audioUrl?: string;
  telefono?: string | null;
  /** Nombre del vendedor/agente que atendió la llamada (de Aircall `user.name`). */
  vendedor?: string | null;
}

export interface ChallengerDimension {
  criterio: string;
  puntos: number;
  max: number;
  justificacion: string;
}

export interface ChallengerAnalysis {
  score: number;
  banda: "rojo" | "amarillo" | "verde";
  perfilVendedor: "challenger" | "hard_worker" | "lone_wolf" | "relationship_builder" | "reactive_problem_solver";
  dimensiones: ChallengerDimension[];
  fortalezas: string[];
  areasMejora: string[];
  insightSugerido: string;
  reframeSugerido: string;
  siguientePaso: string;
}

// ----- Sandler (analisis detallado por etapas) -----
export interface SandlerEvidence {
  cita: string;
  hablante?: "vendedor" | "cliente" | string;
  marcaTiempo?: string;
}
export interface SandlerStage {
  id: number;
  nombre: string;
  peso: number;            // ponderacion 0-100 (las 7 etapas suman 100)
  puntaje: number;         // sub-puntaje 0-100 de esta etapa
  estado: "cumplida" | "parcial" | "deficiente" | "no_aplica";
  aciertos: string[];
  fallos: string[];
  evidencia: SandlerEvidence[];
}
export interface SandlerRecommendation {
  prioridad: "alta" | "media" | "baja";
  etapa?: string;
  accion: string;
  ejemploFrase?: string;
}
export interface SandlerAnalysis {
  puntajeFinal: number;    // ponderado 0-100
  banda: "rojo" | "amarillo" | "verde";
  etapas: SandlerStage[];
  fortalezas: string[];
  areasMejora: string[];
  recomendaciones: SandlerRecommendation[];
  momentoClave?: string;
}

// ----- Analisis integrado (fusion Sandler + Challenger) -----
export interface IntegratedAnalysis {
  scoreGlobal: number;     // 0-100, fusion ponderada de ambos modelos
  banda: "rojo" | "amarillo" | "verde";
  resumenEjecutivo: string;   // resumen potenciado que combina ambos modelos
  diagnostico: string;        // mecanica de venta (Sandler) + reto comercial (Challenger)
  fortalezasClave: string[];
  riesgos: string[];
  planAccion: { prioridad: "alta" | "media" | "baja"; accion: string }[];
  proximaLlamada: string;     // objetivo + up-front contract sugerido
}

// ----- Analisis del vendedor (coaching) -----
export interface SellerSkill { nombre: string; puntaje: number; comentario: string; }
export interface SellerFlaw { descripcion: string; impacto: string; momento?: string; }
export interface SellerImprovement {
  area: string;
  accion: string;
  ejemploFrase?: string;
  prioridad: "alta" | "media" | "baja";
}
export interface SellerAnalysis {
  desempenoGeneral: string;            // valoracion narrativa del vendedor
  puntosClave: string[];               // lo que hizo bien (fortalezas concretas)
  fallos: SellerFlaw[];                // que fallo + impacto en la venta
  mejoras: SellerImprovement[];        // mejoras accionables priorizadas
  habilidades: SellerSkill[];          // radar: escucha, descubrimiento, objeciones, etc.
  estiloComunicacion: string;
  ratioHablaEscucha?: string;          // estimacion "65% vendedor / 35% cliente"
}

// ----- Analisis profundo de toda la llamada -----
export interface DeepCallMoment {
  titulo: string;
  detalle: string;
  tipo: "positivo" | "negativo" | "neutro";
  marcaTiempo?: string;
}
export interface HighlightedQuote { cita: string; hablante: string; porque: string; }
export interface DeepCallAnalysis {
  resumenDetallado: string;            // narrativa extensa de la llamada
  momentos: DeepCallMoment[];          // linea de tiempo de momentos clave
  temasTratados: string[];
  necesidadesCliente: string[];
  senalesCompra: string[];
  banderasRojas: string[];
  citasDestacadas: HighlightedQuote[];
}

// ----- Oportunidades comerciales (upsell / cross-sell) -----
export type UpsellTipo =
  | "expansion_flota"      // necesita más unidades del mismo tipo
  | "renovacion_proxima"   // contrato/renta por vencer → renovar/extender
  | "vehiculo_adicional"   // necesita un tipo de vehículo distinto al cotizado
  | "upgrade_unidad"       // unidad de mayor categoría/capacidad
  | "servicio_adicional";  // GPS, mantenimiento, seguro, conductor, etc.

export interface UpsellSignal {
  tipo: UpsellTipo;
  descripcion: string;
  evidencia?: string;          // cita textual de la transcripción
  vehiculoSugerido?: string;   // qué ofrecer (modelo/categoría/servicio)
  potencial: "alto" | "medio" | "bajo";
  accionSugerida: string;
}

export interface UpsellAnalysis {
  hayOportunidad: boolean;
  resumen: string;
  ingresoIncrementalEstimado?: string | null; // texto, ej "+3 unidades (~30% del contrato)"
  senales: UpsellSignal[];
}

export interface CallIntelligenceOutput {
  resumen: string;
  vehiculosMencionados: string[];
  fechasMencionadas: string[];
  compromisos: { descripcion: string; responsable: string; fecha?: string }[];
  objeciones: string[];
  sentimiento: "positivo" | "neutro" | "negativo";
  probabilidadCierre: "alta" | "media" | "baja";
  telefono?: string | null;
  /** Transcripción completa de la llamada (Deepgram/Aircall/pegada) para mostrarla en el detalle. */
  transcript?: string | null;
  /** Identidad del vendedor que atendió (para coaching/tendencias POR vendedor).
   *  Ojo: `vendedor` (abajo) es el ANÁLISIS de coaching; este es el NOMBRE. */
  vendedorNombre?: string | null;
  sandler?: SandlerAnalysis;
  challenger?: ChallengerAnalysis;
  integrado?: IntegratedAnalysis;
  vendedor?: SellerAnalysis;
  analisisProfundo?: DeepCallAnalysis;
  oportunidades?: UpsellAnalysis;
  /**
   * Procedencia del análisis:
   *  - "ia":       generado por el proveedor de IA real.
   *  - "demo":     modo demo declarado (sin credenciales) → heurísticas.
   *  - "fallback": se INTENTÓ la IA pero falló (timeout/error) y se cayó a
   *                heurísticas. Distingue un resultado degradado de uno real.
   */
  fuenteAnalisis?: "ia" | "demo" | "fallback";
}

// ---------- Monday Writer Agent ----------
export interface MondayWriteInput extends MondayItemRef {
  columnUpdates?: Record<string, unknown>;
  comment?: string;
  subitems?: { name: string; columnValues?: Record<string, unknown> }[];
}

export interface MondayWriteOutput {
  written: boolean;
  columnsUpdated: string[];
  subitemsCreated: number;
  commentPosted: boolean;
}

// ---------- Next Best Action Agent (seguimiento) ----------
export type NextBestActionType =
  | "compromiso_vencido"               // compromiso con fecha pasada, sin seguimiento
  | "compromiso_sin_seguimiento"       // compromiso pactado en llamada, sin actividad posterior
  | "lead_caliente_sin_seguimiento"    // lead caliente sin actividad reciente
  | "lead_tibio_sin_seguimiento"       // lead tibio enfriándose
  | "llamada_requiere_atencion";       // banderas rojas / baja probabilidad de cierre

export interface NextBestAction {
  itemId: string;
  itemName: string;
  reference: string;
  tipo: NextBestActionType;
  prioridad: "alta" | "media" | "baja";
  motivo: string;            // por qué se levantó esta alerta
  accionSugerida: string;    // siguiente paso concreto y accionable
  fechaReferencia?: string | null;  // fecha del compromiso o de la última actividad
  horasSinActividad?: number;
  telefono?: string | null;
}

export interface NextBestActionReport {
  generadoEn: string;
  totalAcciones: number;
  porPrioridad: { alta: number; media: number; baja: number };
  itemsRevisados: number;
  escrituraMonday: boolean;     // si se escribieron alertas en Monday
  acciones: NextBestAction[];
}

// ---------- Orchestrator ----------
export type OrchestratorEventType = "lead_created" | "form_submitted" | "call_recorded";

export interface OrchestratorEvent {
  eventType: OrchestratorEventType;
  item: MondayItemRef;
  payload: Record<string, unknown>;
}
