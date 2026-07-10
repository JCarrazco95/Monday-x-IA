import type { Agent, HealthResponse, LogEntry, LeadAnalysis, LeadsResponse, OrchestratorResult, CallsResponse, AnalyzedCallsResponse, AnalyzedCallDetail, NextBestActionReport, CoachingReport, ForecastReport, AssistantResponse, ScraperSource, ScraperSearchResult, ScraperImportResult, Prospect, TrainingCourse, TrainingLesson, TrainingRecs, QuizForm, QuizResult } from "../types";

const BASE = "/api";

// API key opcional para el backend protegido. Se inyecta en build con
// VITE_API_KEY; si no está, no se envía nada (modo demo/local con auth off).
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reintenta ante 502/503/504: en el plan free de Render el backend "duerme" y
// la PRIMERA petición tarda ~30s en despertarlo. En vez de fallar, esperamos y
// reintentamos para que la vista (incluida la embebida en Monday) cargue sola.
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 4000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method.toUpperCase() === "GET";
  let lastErr: unknown;

  for (let attempt = 0; attempt <= (isGet ? MAX_RETRIES : 0); attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { "x-api-key": API_KEY } : {}),
          ...init?.headers
        }
      });
    } catch (err) {
      // Error de red (backend aún despertando): reintenta si es GET.
      lastErr = err;
      if (isGet && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw err;
    }

    if (GATEWAY_STATUSES.has(res.status) && isGet && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  throw lastErr instanceof Error ? lastErr : new Error("No se pudo conectar con el backend.");
}

export const api = {
  health: () => request<HealthResponse>("/health"),

  getAgents: () => request<Agent[]>("/agents"),
  getAgent: (id: string) => request<Agent>(`/agents/${id}`),
  updateAgent: (id: string, data: Partial<Pick<Agent, "status" | "model">>) =>
    request<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  getLogs: (params: { agent?: string; type?: string; search?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.agent) qs.set("agent", params.agent);
    if (params.type) qs.set("type", params.type);
    if (params.search) qs.set("search", params.search);
    if (params.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<LogEntry[]>(`/logs${query ? `?${query}` : ""}`);
  },

  createLog: (data: {
    agentId: string;
    type: string;
    title: string;
    detail?: string;
    reference?: string;
  }) => request<LogEntry>("/logs", { method: "POST", body: JSON.stringify(data) }),

  exportLogsUrl: () => `${BASE}/logs/export`,

  simulate: (scenario: "form" | "lead" | "call") =>
    request<unknown>(`/orchestrator/simulate/${scenario}`, { method: "POST" }),

  // Analiza una empresa real: dispara el evento lead_created hacia el orquestador.
  analyzeLead: (data: { nombre: string; razonSocial: string; rfc?: string; email?: string }) =>
    request<OrchestratorResult>("/orchestrator/event", {
      method: "POST",
      body: JSON.stringify({
        eventType: "lead_created",
        item: {
          itemId: String(Date.now()),
          itemName: data.nombre.trim() || data.razonSocial.trim()
        },
        payload: {
          nombre: data.nombre.trim(),
          razonSocial: data.razonSocial.trim(),
          rfc: data.rfc?.trim() || undefined,
          email: data.email?.trim() || undefined
        }
      })
    }),

  // Captación desde landing: crea el lead y dispara el análisis automáticamente.
  intake: (data: {
    nombre: string;
    razonSocial?: string;
    email?: string;
    telefono?: string;
    mensaje?: string;
  }) =>
    request<{ itemId: string; itemName: string; mondayMock: boolean; result: OrchestratorResult }>(
      "/leads/intake",
      { method: "POST", body: JSON.stringify(data) }
    ),

  getLeads: () => request<LeadsResponse>("/leads"),
  getLeadAnalysis: (itemId: string) => request<LeadAnalysis>(`/leads/${itemId}`),

  // Historial de llamadas (Aircall) de un cliente por teléfono.
  getCalls: (phone: string) => request<CallsResponse>(`/calls?phone=${encodeURIComponent(phone)}`),

  // Llamadas analizadas (Sandler + Challenger) para la página Call Intelligence.
  getAnalyzedCalls: (phone?: string) => request<AnalyzedCallsResponse>(`/calls/analyzed${phone ? `?phone=${encodeURIComponent(phone)}` : ""}`),
  getAnalyzedCall: (itemId: string) => request<AnalyzedCallDetail>(`/calls/analyzed/${encodeURIComponent(itemId)}`),

  // Trae una llamada de Aircall por su ID (grabación + transcripción) y la analiza.
  ingestAircallCall: (callId: string, opts: { transcript?: string; telefono?: string } = {}) =>
    request<{ ok: boolean; analizada: boolean; itemId?: string; itemName?: string; motivo?: string }>(
      `/calls/aircall/${encodeURIComponent(callId)}`,
      { method: "POST", body: JSON.stringify(opts) }
    ),

  // Transcribe (Deepgram) la grabación de una URL y la analiza. Cualquier proveedor.
  ingestCallFromUrl: (url: string, opts: { telefono?: string; contacto?: string } = {}) =>
    request<{ ok: boolean; analizada: boolean; itemId?: string; itemName?: string; motivo?: string }>(
      `/calls/from-url`,
      { method: "POST", body: JSON.stringify({ url, ...opts }) }
    ),

  // Analiza una transcripción YA EXISTENTE (pegada), sin re-transcribir.
  analyzeTranscript: (transcript: string, opts: { prospecto?: string; telefono?: string } = {}) =>
    request<{ ok: boolean; analizada: boolean; itemId?: string; itemName?: string; motivo?: string }>(
      `/calls/analyze-transcript`,
      { method: "POST", body: JSON.stringify({ transcript, ...opts }) }
    ),

  // Tablero de llamadas de Aircall en Monday: vista previa y sincronización.
  getCallsBoard: () =>
    request<{ configured: boolean; total: number; items: { itemId: string; itemName: string; callId: string | null; link: string | null; leadName: string | null }[] }>(
      `/calls/board`
    ),
  // La sincronización es ASÍNCRONA: el POST responde 202 y el avance se
  // consulta con getSyncStatus (los proxies cortan peticiones largas).
  syncCallsBoard: () =>
    request<{ started: boolean; startedAt: string }>(`/calls/sync-board`, { method: "POST" }),
  getSyncStatus: () =>
    request<{
      running: boolean; startedAt: string | null; finishedAt: string | null; error: string | null;
      result: { leidas: number; analizadas: number; yaAnalizadas: number; sinFuente: number; errores: { itemName: string; motivo: string }[] } | null;
    }>(`/calls/sync-status`),

  // Next Best Action (seguimiento): vista previa (no escribe) y ejecución (escribe en Monday).
  getNextBestActions: () => request<NextBestActionReport>("/nba"),
  runNextBestActions: () => request<NextBestActionReport>("/nba/run", { method: "POST" }),

  // Coaching (equipo o por vendedor; opcionalmente acotado a los últimos N días).
  getCoaching: (opts: { vendedor?: string | null; dias?: number | null } = {}) => {
    const params = new URLSearchParams();
    if (opts.vendedor) params.set("vendedor", opts.vendedor);
    if (opts.dias) params.set("dias", String(opts.dias));
    const qs = params.toString();
    return request<CoachingReport>(`/coaching${qs ? `?${qs}` : ""}`);
  },

  // Entrenamiento (LMS Sandler).
  getCourses: (vendedor?: string, todos = false) => {
    const qs = new URLSearchParams();
    if (vendedor) qs.set("vendedor", vendedor);
    if (todos) qs.set("todos", "true");
    return request<{ cursos: TrainingCourse[] }>(`/training/courses${qs.toString() ? `?${qs}` : ""}`);
  },
  getLesson: (id: number) => request<TrainingLesson>(`/training/lessons/${id}`),
  completeLesson: (id: number, vendedor: string) =>
    request<{ ok: boolean }>(`/training/lessons/${id}/complete`, { method: "POST", body: JSON.stringify({ vendedor }) }),
  getTrainingRecs: (vendedor?: string) =>
    request<TrainingRecs>(`/training/recomendaciones${vendedor ? `?vendedor=${encodeURIComponent(vendedor)}` : ""}`),
  getQuiz: (courseId: number) => request<QuizForm>(`/training/courses/${courseId}/quiz`),
  submitQuiz: (courseId: number, vendedor: string, respuestas: number[]) =>
    request<QuizResult>(`/training/courses/${courseId}/quiz`, { method: "POST", body: JSON.stringify({ vendedor, respuestas }) }),
  createCourse: (data: { titulo: string; descripcion?: string; etapaSandler?: number | null; publicado?: boolean }) =>
    request<{ ok: boolean; id: number }>(`/training/courses`, { method: "POST", body: JSON.stringify(data) }),
  updateCourse: (id: number, data: Partial<{ titulo: string; descripcion: string; publicado: boolean; orden: number }>) =>
    request<{ ok: boolean }>(`/training/courses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCourse: (id: number) => request<{ ok: boolean }>(`/training/courses/${id}`, { method: "DELETE" }),
  createLesson: (courseId: number, data: { titulo: string; contenido: string; videoUrl?: string; etapaSandler?: number | null; duracionMin?: number }) =>
    request<{ ok: boolean; id: number }>(`/training/courses/${courseId}/lessons`, { method: "POST", body: JSON.stringify(data) }),
  updateLesson: (id: number, data: Partial<{ titulo: string; contenido: string; videoUrl: string; etapaSandler: number; duracionMin: number; orden: number }>) =>
    request<{ ok: boolean }>(`/training/lessons/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteLesson: (id: number) => request<{ ok: boolean }>(`/training/lessons/${id}`, { method: "DELETE" }),

  // C.7: Reporte ejecutivo del período (markdown listo para enviar).
  getExecutiveReport: (dias = 7) =>
    request<{ periodo: { desde: string; hasta: string; dias: number }; markdown: string }>(
      `/reports/executive?dias=${dias}`
    ),

  // Forecast / pipeline ponderado por probabilidad.
  getForecast: () => request<ForecastReport>("/forecast"),

  // Asistente comercial (Chat RAG sobre el histórico).
  askAssistant: (question: string) =>
    request<AssistantResponse>("/assistant/chat", { method: "POST", body: JSON.stringify({ question }) }),

  // Scraper / prospección de leads.
  getScraperSources: () => request<{ sources: ScraperSource[] }>("/scraper/sources"),
  searchProspects: (data: { source: string; sector: string; ciudad?: string; limite?: number; page?: number }) =>
    request<ScraperSearchResult>("/scraper/search", { method: "POST", body: JSON.stringify(data) }),
  importProspects: (prospects: Prospect[]) =>
    request<ScraperImportResult>("/scraper/import", { method: "POST", body: JSON.stringify({ prospects }) })
};
