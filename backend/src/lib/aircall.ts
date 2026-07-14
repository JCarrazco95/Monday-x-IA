// ===========================================================================
//  Aircall — historial de llamadas por número de cliente.
//
//  API:  GET https://api.aircall.io/v1/calls/search?phone_number=<num>
//  Auth: HTTP Basic (api_id : api_token)
//  Cada llamada indica si fue contestada (answered_at) → verde/rojo en la UI.
//
//  Defensivo: si no hay credenciales o falla, devuelve [] y la UI muestra
//  "conecta Aircall". El botón de marcar (tel:) funciona igual sin la API.
// ===========================================================================

const AIRCALL_BASE = process.env.AIRCALL_API_URL ?? "https://api.aircall.io/v1";
const AIRCALL_API_ID = process.env.AIRCALL_API_ID;
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN;
const AIRCALL_ENABLED =
  Boolean(AIRCALL_API_ID && AIRCALL_API_TOKEN) &&
  (process.env.AIRCALL_API_ENABLED ?? "true").toLowerCase() !== "false";
const AIRCALL_TIMEOUT_MS = Number(process.env.AIRCALL_TIMEOUT_MS ?? 9000);

export interface CallRecord {
  id: string;
  direction: "inbound" | "outbound" | string;
  answered: boolean;
  startedAt: string | null;
  durationSec: number;
  numero?: string | null;
  usuario?: string | null;
}

interface AircallCall {
  id?: number | string;
  direction?: string;
  status?: string;
  started_at?: number;
  answered_at?: number | null;
  duration?: number;
  raw_digits?: string;
  user?: { name?: string };
}

export const aircallEnabled = AIRCALL_ENABLED;

export async function listCallsByPhone(phone?: string | null): Promise<CallRecord[]> {
  const digits = (phone ?? "").replace(/[^0-9+]/g, "");
  if (!AIRCALL_ENABLED || digits.length < 7) return [];

  const auth = "Basic " + Buffer.from(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`).toString("base64");
  const url = `${AIRCALL_BASE}/calls/search?phone_number=${encodeURIComponent(digits)}&per_page=20&order=desc`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: AbortSignal.timeout(AIRCALL_TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { calls?: AircallCall[] };
    const calls = json.calls ?? [];
    return calls.map((c) => ({
      id: String(c.id ?? ""),
      direction: c.direction ?? "outbound",
      answered: Boolean(c.answered_at) || c.status === "answered" || (c.duration ?? 0) > 0,
      startedAt: c.started_at ? new Date(c.started_at * 1000).toISOString() : null,
      durationSec: c.duration ?? 0,
      numero: c.raw_digits ?? null,
      usuario: c.user?.name ?? null
    }));
  } catch {
    return [];
  }
}

// ----- Ingesta de una llamada concreta (para el webhook de Aircall) -----
export interface AircallCallDetail {
  id: string;
  numero: string | null;
  contacto: string | null;
  direction: string;
  durationSec: number;
  startedAt: string | null;
  agente: string | null;
  recordingUrl: string | null;
  /** Buzón de voz / sin respuesta si es false — no hay conversación que analizar. */
  answered: boolean;
}

interface AircallCallFull extends AircallCall {
  recording?: string | null;
  contact?: { first_name?: string; last_name?: string; name?: string } | null;
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${AIRCALL_API_ID}:${AIRCALL_API_TOKEN}`).toString("base64");
}

/** Trae el detalle de una llamada por id (incluye URL de grabacion si existe). */
export async function getAircallCall(id: string | number): Promise<AircallCallDetail | null> {
  if (!AIRCALL_ENABLED || !id) return null;
  try {
    const res = await fetch(`${AIRCALL_BASE}/calls/${id}`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      signal: AbortSignal.timeout(AIRCALL_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { call?: AircallCallFull };
    const c = json.call;
    if (!c) return null;
    const contacto =
      c.contact?.name ??
      ([c.contact?.first_name, c.contact?.last_name].filter(Boolean).join(" ") || null);
    return {
      id: String(c.id ?? id),
      numero: c.raw_digits ?? null,
      contacto: contacto || null,
      direction: c.direction ?? "outbound",
      durationSec: c.duration ?? 0,
      startedAt: c.started_at ? new Date(c.started_at * 1000).toISOString() : null,
      agente: c.user?.name ?? null,
      recordingUrl: c.recording ?? null,
      answered: Boolean(c.answered_at) || c.status === "answered" || (c.duration ?? 0) > 0
    };
  } catch {
    return null;
  }
}

/** Diagnóstico: JSON crudo de la transcripción de Aircall AI, sin parsear. */
export async function getAircallTranscriptRaw(id: string | number): Promise<unknown> {
  if (!AIRCALL_ENABLED || !id) return { error: "Aircall no configurado o falta id" };
  const res = await fetch(`${AIRCALL_BASE}/calls/${id}/transcription`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    signal: AbortSignal.timeout(AIRCALL_TIMEOUT_MS)
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

/**
 * Etiqueta las utterances de Aircall AI usando su propio campo
 * `participant_type` ("internal" = quien atiende, nuestro Vendedor;
 * "external" = el cliente en la otra línea) — a diferencia de Deepgram,
 * Aircall YA sabe quién es quién, no hace falta adivinar por orden/dirección.
 * (Antes se asumía un campo `speaker_id` que la API real no trae — cada
 * utterance quedaba con speaker `undefined` y todo colapsaba en un solo
 * "Hablante", ver diagnóstico contra la API real.)
 */
function formatAircallUtterances(utterances: { participant_type?: string; text?: string }[]): string {
  const lines: { label: string; text: string }[] = [];
  for (const u of utterances) {
    const text = u.text?.trim();
    if (!text) continue;
    const label = u.participant_type === "internal" ? "Vendedor" : u.participant_type === "external" ? "Cliente" : "Hablante";
    const last = lines[lines.length - 1];
    if (last && last.label === label) last.text += ` ${text}`;
    else lines.push({ label, text });
  }
  return lines.map((l) => `${l.label}: ${l.text}`).join("\n");
}

/** Transcripcion de Aircall AI (si la cuenta tiene el add-on). Devuelve texto o null. */
export async function getAircallTranscript(id: string | number): Promise<string | null> {
  if (!AIRCALL_ENABLED || !id) return null;
  try {
    const res = await fetch(`${AIRCALL_BASE}/calls/${id}/transcription`, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      signal: AbortSignal.timeout(AIRCALL_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      transcription?: { content?: { utterances?: { participant_type?: string; text?: string }[] } | string };
    };
    const content = json.transcription?.content;
    if (typeof content === "string") return content;
    const utt = content?.utterances;
    if (Array.isArray(utt) && utt.length) {
      return formatAircallUtterances(utt);
    }
    return null;
  } catch {
    return null;
  }
}
