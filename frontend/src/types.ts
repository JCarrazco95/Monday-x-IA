export type AgentStatus = "active" | "paused" | "error";
export type LogType = "info" | "success" | "warning" | "error";

export interface AgentStats {
  agent_id: string;
  total: number;
  errors: number;
  last_event: string | null;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  priority: number;
  status: AgentStatus;
  model: string;
  tools: string[];
  version: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  stats: AgentStats;
  recentLogs?: LogEntry[];
}

export interface LogEntry {
  id: number;
  timestamp: string;
  agent_id: string;
  agent_name?: string;
  type: LogType;
  title: string;
  detail: string | null;
  reference: string | null;
  payload: string | null;
  duration_ms: number | null;
}

export interface ScoreFactor {
  factor: string;
  puntos: number;
  max: number;
  justificacion: string;
}

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
  rentaOtrasMarcas: { detectado: boolean; competidores?: string[]; detalle?: string | null };
  gobierno: { tieneContratos: boolean; detalle?: string | null; fuente?: string | null };
  fuentes: { titulo: string; url: string }[];
  confianza: "alta" | "media" | "baja";
}

export interface LeadAnalysis {
  itemId: string;
  itemName: string;
  updatedAt: string | null;
  agents: string[];
  lead: {
    score: number;
    scoreBreakdown: ScoreFactor[];
    prioridad: "caliente" | "tibia" | "fria" | null;
    riesgo: string;
    perfilEmpresa: string | null;
    accionRecomendada: string | null;
    siguientesPasos: string[];
    preguntasDiscovery: string[];
    riesgosComerciales: string[];
    duplicado: boolean;
    duplicadoRef: string | null;
    resumen: string | null;
    email: string | null;
    telefono: string | null;
    rfc: string | null;
    razonSocial: string | null;
    research: CompanyResearch | null;
    fuenteAnalisis: "web" | "modelo" | "demo" | null;
    conocimientoPrevio: boolean;
  } | null;
  form: {
    vehiculoInteres: string | null;
    duracionRenta: string | null;
    tipoCliente: string | null;
    urgencia: string | null;
    disponibleEnFlota: boolean;
    plantillaRespuesta: string | null;
    resumen: string | null;
  } | null;
  call: CallAnalysisData | null;
}

export interface LeadSummary {
  itemId: string;
  itemName: string;
  score: number | null;
  prioridad: "caliente" | "tibia" | "fria" | null;
  riesgo: string | null;
  duplicado: boolean;
  sentimiento: string | null;
  vehiculo: string | null;
  estado: string;
  updatedAt: string | null;
}

export interface LeadsResponse {
  stats: {
    analizadosHoy: number;
    total: number;
    scorePromedio: number;
    altoPotencial: number;
    duplicados: number;
  };
  leads: LeadSummary[];
}

export interface HealthResponse {
  status: string;
  claudeMode: "mock" | "live";
  aiProvider?: "claude" | "gemini" | "demo";
  mondayMode: "mock" | "live";
  db?: "sqlite" | "postgres" | "uninitialized";
  timestamp: string;
}

// ── Next Best Action (seguimiento) ──
export type NextBestActionType =
  | "compromiso_vencido"
  | "compromiso_sin_seguimiento"
  | "lead_caliente_sin_seguimiento"
  | "lead_tibio_sin_seguimiento"
  | "llamada_requiere_atencion";

export interface NextBestAction {
  itemId: string;
  itemName: string;
  reference: string;
  tipo: NextBestActionType;
  prioridad: "alta" | "media" | "baja";
  motivo: string;
  accionSugerida: string;
  fechaReferencia?: string | null;
  horasSinActividad?: number;
  telefono?: string | null;
}

export interface NextBestActionReport {
  generadoEn: string;
  totalAcciones: number;
  porPrioridad: { alta: number; media: number; baja: number };
  itemsRevisados: number;
  escrituraMonday: boolean;
  acciones: NextBestAction[];
}

// ── Coaching del equipo (agregación) ──
export interface CoachingRanking {
  vendedor: string;
  llamadas: number;
  sandlerProm: number;
  challengerProm: number;
  globalProm: number;
  verdes: number;
  rojas: number;
}

export interface CoachingReport {
  filtro: { vendedor: string | null; dias: number | null };
  /** Vendedores con llamadas evaluables en el periodo (para el selector). */
  vendedores: string[];
  /** Comparativa por vendedor (incluye "Sin identificar" si aplica). */
  ranking: CoachingRanking[];
  /** Temas/objeciones creciendo: ventana reciente vs la anterior. */
  temasEmergentes?: { texto: string; actual: number; previo: number }[];
  ventanaEmergentesDias?: number;
  stats: {
    totalLlamadas: number;
    noEvaluables?: number;
    sandlerProm: number;
    challengerProm: number;
    globalProm: number;
    verdes: number;
    rojas: number;
  };
  etapasSandler: { id: number; nombre: string; peso: number; promedio: number; muestras: number }[];
  etapaMasDebil: { id: number; nombre: string; peso: number; promedio: number } | null;
  porVendedor?: {
    vendedor: string;
    llamadas: number;
    sandlerProm: number;
    challengerProm: number;
    globalProm: number;
    etapaMasDebil: { nombre: string; promedio: number } | null;
    etapas?: { id: number; nombre: string; promedio: number }[];
    insignias?: string[];
    posicion?: number;
    tendencia?: { periodo: string; globalProm: number; count: number }[];
  }[];
  perfilesVendedor: { perfil: string; count: number; pct: number }[];
  habilidades: { nombre: string; promedio: number }[];
  banderasRojas: { texto: string; count: number }[];
  objeciones: { texto: string; count: number }[];
  areasMejora: { texto: string; count: number }[];
  tendencia: { periodo: string; globalProm: number; count: number }[];
}

// ── Forecast / Pipeline ponderado ──
export interface ForecastOpportunity {
  itemId: string;
  itemName: string;
  empresa: string | null;
  ejecutivo: string | null;
  etapa: string;
  prioridad: "caliente" | "tibia" | "fria" | null;
  probabilidad: number;            // 0-100
  probabilidadFuente: "llamada" | "lead" | "default" | "etapa";
  valorEstimado: number;
  valorPonderado: number;
  sinMonto: boolean;
  mesCierreKey: string;
  mesCierre: string;
}

export interface ForecastReport {
  /** "monday" = datos reales del board de Oportunidades; "estimado" = heurística demo. */
  fuente: "monday" | "estimado";
  supuestos: {
    ticketBase?: number;
    moneda: string;
    nota: string;
    probabilidades: Record<string, Record<string, number>>;
  };
  stats: {
    totalOportunidades: number;
    valorPipeline: number;
    valorPonderado: number;
    ticketPromedio: number;
    probPromedio: number;
    sinMonto: number;
    ganadoMes: number | null;
    ganadoAnio: number | null;
  };
  funnel: { etapa: string; count: number; valor: number; valorPonderado: number }[];
  porMes: { mes: string; valorPonderado: number; valorBruto: number; count: number; objetivo: number | null }[];
  porEjecutivo: { ejecutivo: string; count: number; valor: number; valorPonderado: number }[];
  objetivos: { disponible: boolean; motivo: string | null };
  topOportunidades: ForecastOpportunity[];
}

// ── Asistente comercial (Chat RAG) ──
export interface AssistantResponse {
  respuesta: string;
  itemsCitados: string[];
  contexto: { itemId: string; itemName: string }[];
}

// Resultado del orquestador al procesar un evento (p. ej. analizar empresa real)
export interface OrchestratorResult {
  skipped?: boolean;
  reason?: string;
  writeInput?: {
    itemId: string;
    itemName: string;
    columnUpdates?: Record<string, unknown>;
    comment?: string;
  };
}

export interface CallRecord {
  id: string;
  direction: "inbound" | "outbound" | string;
  answered: boolean;
  startedAt: string | null;
  durationSec: number;
  numero?: string | null;
  usuario?: string | null;
}

export interface CallsResponse {
  enabled: boolean;
  calls: CallRecord[];
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
  perfilVendedor: string;
  dimensiones: ChallengerDimension[];
  fortalezas: string[];
  areasMejora: string[];
  insightSugerido: string;
  reframeSugerido: string;
  siguientePaso: string;
}

// ── Coaching del vendedor ──
export interface SellerSkill { nombre: string; puntaje: number; comentario: string; }
export interface SellerFlaw { descripcion: string; impacto: string; momento?: string; }
export interface SellerImprovement { area: string; accion: string; ejemploFrase?: string; prioridad: "alta" | "media" | "baja"; }
export interface SellerAnalysis {
  desempenoGeneral: string;
  puntosClave: string[];
  fallos: SellerFlaw[];
  mejoras: SellerImprovement[];
  habilidades: SellerSkill[];
  estiloComunicacion: string;
  ratioHablaEscucha?: string;
}

// ── Analisis profundo de la llamada ──
export interface DeepCallMoment { titulo: string; detalle: string; tipo: "positivo" | "negativo" | "neutro"; marcaTiempo?: string; }
export interface HighlightedQuote { cita: string; hablante: string; porque: string; }
export interface DeepCallAnalysis {
  resumenDetallado: string;
  momentos: DeepCallMoment[];
  temasTratados: string[];
  necesidadesCliente: string[];
  senalesCompra: string[];
  banderasRojas: string[];
  citasDestacadas: HighlightedQuote[];
}

// ── Sandler (analisis detallado por etapas) ──
export interface SandlerEvidence { cita: string; hablante?: string; marcaTiempo?: string; }
export interface SandlerStage {
  id: number;
  nombre: string;
  peso: number;
  puntaje: number;
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
  puntajeFinal: number;
  banda: Banda;
  etapas: SandlerStage[];
  fortalezas: string[];
  areasMejora: string[];
  recomendaciones: SandlerRecommendation[];
  momentoClave?: string;
}

// ── Analisis integrado (fusion Sandler + Challenger) ──
export interface IntegratedAnalysis {
  scoreGlobal: number;
  banda: Banda;
  resumenEjecutivo: string;
  diagnostico: string;
  fortalezasClave: string[];
  riesgos: string[];
  planAccion: { prioridad: "alta" | "media" | "baja"; accion: string }[];
  proximaLlamada: string;
}

// ── Call Intelligence: llamadas analizadas (Sandler + Challenger) ──
export type Banda = "rojo" | "amarillo" | "verde";

export interface AnalyzedCallListItem {
  itemId: string;
  idLlamada: string;
  prospecto: string;
  vendedor: string | null;
  fecha: string | null;
  sentimiento: string | null;
  sandlerScore: number;
  sandlerBanda: Banda;
  challengerScore: number | null;
  challengerBanda: Banda | null;
  perfilVendedor: string | null;
  globalScore: number | null;
  globalBanda: Banda | null;
  telefono: string | null;
  resumen: string | null;
  /** Temas tratados + objeciones de la llamada (para chips de filtro). */
  temas: string[];
}

export interface AnalyzedCallsResponse {
  stats: { total: number; sandlerPromedio: number; challengerPromedio: number; globalPromedio: number; verdes: number; rojas: number };
  calls: AnalyzedCallListItem[];
}

// ── Oportunidades comerciales (upsell / cross-sell) ──
export type UpsellTipo =
  | "expansion_flota" | "renovacion_proxima" | "vehiculo_adicional" | "upgrade_unidad" | "servicio_adicional";
export interface UpsellSignal {
  tipo: UpsellTipo;
  descripcion: string;
  evidencia?: string;
  vehiculoSugerido?: string;
  potencial: "alto" | "medio" | "bajo";
  accionSugerida: string;
}
export interface UpsellAnalysis {
  hayOportunidad: boolean;
  resumen: string;
  ingresoIncrementalEstimado?: string | null;
  senales: UpsellSignal[];
}

export interface CallAnalysisData {
  telefono?: string | null;
  /** Transcripción completa de la llamada (Deepgram/Aircall/pegada). */
  transcript?: string | null;
  sentimiento: string | null;
  probabilidadCierre: string | null;
  vehiculosMencionados: string[];
  objeciones: string[];
  compromisos: { descripcion: string; responsable: string; fecha?: string }[];
  fechasMencionadas: string[];
  resumen: string | null;
  sandler: SandlerAnalysis | null;
  challenger: ChallengerAnalysis | null;
  integrado: IntegratedAnalysis | null;
  vendedor: SellerAnalysis | null;
  analisisProfundo: DeepCallAnalysis | null;
  oportunidades?: UpsellAnalysis | null;
}

export interface AnalyzedCallDetail {
  itemId: string;
  idLlamada: string;
  prospecto: string;
  itemName: string;
  fecha: string | null;
  call: CallAnalysisData;
}

// ── Scraper / prospección de leads ──────────────────────────────────────────
export interface ScraperSource {
  id: string;
  label: string;
  enabled: boolean;
  aviso?: string;
}

export interface Prospect {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  sitioWeb?: string | null;
  direccion?: string | null;
  categoria?: string | null;
  fuente: string;
  externalId?: string | null;
}

export interface ScoredProspect extends Prospect {
  duplicado: boolean;
}

export interface ScraperSearchResult {
  fuente: string;
  demo: boolean;
  total: number;
  nuevos: number;
  duplicados: number;
  prospects: ScoredProspect[];
}

export interface ScraperImportResult {
  importados: number;
  omitidos: number;
  itemIds: string[];
  errores: { nombre: string; error: string }[];
}

// ── Entrenamiento (LMS Sandler) ──
export interface TrainingLessonSummary {
  id: number;
  titulo: string;
  etapaSandler: number | null;
  etapaNombre: string | null;
  duracionMin: number | null;
  tieneVideo: boolean;
  orden: number;
  completada: boolean;
}
export interface TrainingCourse {
  id: number;
  titulo: string;
  descripcion: string | null;
  etapaSandler: number | null;
  publicado: boolean;
  lecciones: TrainingLessonSummary[];
  progreso: number;
  completadas: number;
  total: number;
}
export interface TrainingLesson {
  id: number;
  courseId: number;
  cursoTitulo: string;
  titulo: string;
  contenido: string;
  videoUrl: string | null;
  etapaSandler: number | null;
  etapaNombre: string | null;
  duracionMin: number | null;
}
export interface TrainingRecs {
  vendedor: string | null;
  etapaDebil: { id: number; nombre: string; promedio: number; fuente: "vendedor" | "equipo" } | null;
  lecciones: { id: number; titulo: string; cursoTitulo: string; duracionMin: number | null; tieneVideo: boolean; completada: boolean }[];
}
