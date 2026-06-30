// ===========================================================================
//  Ingesta de una llamada de Aircall por su ID (bajo demanda).
//
//  Reúne en un solo lugar el flujo que ya usaba el webhook: trae la llamada
//  (grabación + metadatos), consigue la transcripción (Aircall AI o, como
//  fallback, Deepgram sobre la grabación) y dispara el análisis (Call
//  Intelligence). Lo usan tanto el webhook (/api/webhooks/aircall) como la ruta
//  manual (/api/calls/aircall/:callId).
//
//  Defensivo: si no hay credenciales o no hay transcripción, NO rompe: devuelve
//  un resultado explicando el motivo.
// ===========================================================================

import { handleOrchestratorEvent } from "../agents/orchestratorAgent.js";
import { logActivity } from "./activityLog.js";
import { getAircallCall, getAircallTranscript, aircallEnabled } from "./aircall.js";
import { transcribeRecording } from "./transcription.js";

export interface AircallIngestResult {
  ok: boolean;
  analizada: boolean;
  itemId?: string;
  itemName?: string;
  telefono?: string | null;
  contacto?: string | null;
  /** Motivo si NO se analizó (sin credenciales, sin transcripción, etc.). */
  motivo?: string;
  result?: unknown;
}

export async function ingestAircallCall(
  callId: string | number,
  opts: {
    /** Datos que pudieron venir en el webhook (evita una llamada extra). */
    numeroHint?: string | null;
    contactoHint?: string | null;
    recordingHint?: string | null;
    /** Transcripción ya provista (p. ej. pegada a mano); evita ir a Aircall. */
    transcriptOverride?: string | null;
  } = {}
): Promise<AircallIngestResult> {
  if (!callId) return { ok: false, analizada: false, motivo: "Falta el ID de la llamada." };

  // Detalle de la llamada (grabación, número, contacto). Si Aircall no está
  // configurado, getAircallCall devuelve null; seguimos con los hints/override.
  const detail = aircallEnabled ? await getAircallCall(callId) : null;
  const numero = detail?.numero ?? opts.numeroHint ?? null;
  const contacto = detail?.contacto ?? opts.contactoHint ?? null;
  const recordingUrl = detail?.recordingUrl ?? opts.recordingHint ?? null;

  // Transcripción: override > Aircall AI > Deepgram sobre la grabación.
  let transcript: string | null = opts.transcriptOverride ?? null;
  if (!transcript && aircallEnabled) transcript = await getAircallTranscript(callId);
  if (!transcript) transcript = await transcribeRecording(recordingUrl);

  const itemId = `aircall-${callId}`;
  const itemName = `Llamada — ${contacto ?? numero ?? `Aircall ${callId}`}`;

  if (!transcript) {
    const motivo = !aircallEnabled
      ? "Aircall no está configurado (AIRCALL_API_ID/TOKEN) y no se proporcionó transcripción."
      : `No se pudo obtener transcripción de la llamada ${callId}. Activa Aircall AI o DEEPGRAM_API_KEY, o pega la transcripción manualmente.`;
    logActivity({
      agentId: "call_intelligence",
      type: "warning",
      title: "Llamada Aircall sin transcripción",
      detail: motivo,
      reference: `#${itemId} · ${contacto ?? numero ?? "Llamada"}`
    });
    return { ok: false, analizada: false, itemId, itemName, telefono: numero, contacto, motivo };
  }

  const result = await handleOrchestratorEvent({
    eventType: "call_recorded",
    item: { itemId, itemName },
    payload: { transcript, telefono: numero, audioUrl: recordingUrl ?? undefined }
  });

  return { ok: true, analizada: true, itemId, itemName, telefono: numero, contacto, result };
}
