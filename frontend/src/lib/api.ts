import type { Agent, HealthResponse, LogEntry, LeadAnalysis, LeadsResponse, OrchestratorResult, CallsResponse, AnalyzedCallsResponse, AnalyzedCallDetail, NextBestActionReport, CoachingReport, ForecastReport, AssistantResponse, ScraperSource, ScraperSearchResult, ScraperImportResult, Prospect } from "../types";

const BASE = "/api";

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
        headers: { "Content-Type": "application/json" },
        ...init
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
  syncCallsBoard: () =>
    request<{ leidas: number; analizadas: number; yaAnalizadas: number; sinFuente: number; errores: { itemName: string; motivo: string }[] }>(
      `/calls/sync-board`,
      { method: "POST" }
    ),

  // Next Best Action (seguimiento): vista previa (no escribe) y ejecución (escribe en Monday).
  getNextBestActions: () => request<NextBestActionReport>("/nba"),
  runNextBestActions: () => request<NextBestActionReport>("/nba/run", { method: "POST" }),

  // Coaching del equipo (agregación sobre llamadas analizadas).
  getCoaching: () => request<CoachingReport>("/coaching"),

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
