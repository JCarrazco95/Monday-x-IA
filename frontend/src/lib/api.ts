import type { Agent, HealthResponse, LogEntry, LeadAnalysis, LeadsResponse, OrchestratorResult, CallsResponse, AnalyzedCallsResponse, AnalyzedCallDetail, NextBestActionReport, CoachingReport, ForecastReport, AssistantResponse } from "../types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
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

  // Next Best Action (seguimiento): vista previa (no escribe) y ejecución (escribe en Monday).
  getNextBestActions: () => request<NextBestActionReport>("/nba"),
  runNextBestActions: () => request<NextBestActionReport>("/nba/run", { method: "POST" }),

  // Coaching del equipo (agregación sobre llamadas analizadas).
  getCoaching: () => request<CoachingReport>("/coaching"),

  // Forecast / pipeline ponderado por probabilidad.
  getForecast: () => request<ForecastReport>("/forecast"),

  // Asistente comercial (Chat RAG sobre el histórico).
  askAssistant: (question: string) =>
    request<AssistantResponse>("/assistant/chat", { method: "POST", body: JSON.stringify({ question }) })
};
