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

import crypto from "node:crypto";
import { handleOrchestratorEvent } from "../agents/orchestratorAgent.js";
import { logActivity } from "./activityLog.js";
import { getAircallCall, getAircallTranscript, aircallEnabled } from "./aircall.js";
import { transcribeRecording, transcriptionEnabled } from "./transcription.js";

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
    const idNumerico = /^\d+$/.test(String(callId));
    let motivo: string;
    if (!aircallEnabled && !opts.transcriptOverride) {
      motivo = "Aircall no está configurado (AIRCALL_API_ID/TOKEN) y no se proporcionó transcripción.";
    } else if (!detail) {
      motivo =
        `No encontré una llamada con el ID "${callId}" en Aircall.` +
        (idNumerico
          ? " Verifica que el ID y las credenciales correspondan a la misma cuenta de Aircall."
          : " Los IDs de Aircall son numéricos; este parece de otro proveedor (p. ej. un Call SID de Twilio).");
    } else {
      motivo = `Encontré la llamada ${callId}, pero sin transcripción disponible. Activa Aircall AI o DEEPGRAM_API_KEY, o pega la transcripción manualmente.`;
    }
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

// ===========================================================================
//  Análisis directo de una transcripción YA EXISTENTE (la vía más simple).
//
//  Cuando el proveedor (Aircall, Twilio, etc.) ya transcribió la llamada, no
//  tiene sentido re-transcribir: se pega/recibe el texto y se analiza tal cual.
//  No requiere credenciales ni Deepgram.
// ===========================================================================
export async function ingestCallFromTranscript(opts: {
  transcript: string;
  prospecto?: string | null;
  telefono?: string | null;
}): Promise<AircallIngestResult> {
  const transcript = opts.transcript?.trim();
  if (!transcript) return { ok: false, analizada: false, motivo: "Falta la transcripción." };
  if (transcript.length < 40) {
    return { ok: false, analizada: false, motivo: "La transcripción es demasiado corta para analizar." };
  }

  const hash = crypto.createHash("md5").update(transcript).digest("hex").slice(0, 10);
  const itemId = `call-${hash}`;
  const itemName = `Llamada — ${opts.prospecto ?? opts.telefono ?? "transcripción"}`;

  const result = await handleOrchestratorEvent({
    eventType: "call_recorded",
    item: { itemId, itemName },
    payload: { transcript, telefono: opts.telefono ?? null }
  });

  return { ok: true, analizada: true, itemId, itemName, telefono: opts.telefono ?? null, contacto: opts.prospecto ?? null, result };
}

// ===========================================================================
//  Ingesta desde una URL de grabación (independiente del proveedor).
//
//  Dada la URL del audio de la llamada (Twilio, Aircall, S3, etc.), la transcribe
//  con Deepgram y dispara el análisis. Funciona con cualquier proveedor siempre
//  que la URL sea accesible (pública o con token en la propia URL).
// ===========================================================================
export async function ingestCallFromUrl(opts: {
  url: string;
  telefono?: string | null;
  contacto?: string | null;
}): Promise<AircallIngestResult> {
  const url = opts.url?.trim();
  if (!url) return { ok: false, analizada: false, motivo: "Falta la URL de la grabación." };

  // Id estable derivado de la URL para no duplicar análisis de la misma llamada.
  const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 10);
  const itemId = `url-${hash}`;
  const itemName = `Llamada — ${opts.contacto ?? opts.telefono ?? "grabación"}`;

  const transcript = await transcribeRecording(url);
  if (!transcript) {
    const motivo = !transcriptionEnabled
      ? "Falta DEEPGRAM_API_KEY para transcribir desde una URL. Configúralo en Render o pega la transcripción manualmente."
      : "No pude transcribir la grabación desde esa URL. Verifica que apunte al AUDIO (mp3/wav) y que sea accesible sin autenticación.";
    logActivity({
      agentId: "call_intelligence",
      type: "warning",
      title: "Grabación por URL sin transcripción",
      detail: motivo,
      reference: `#${itemId} · ${opts.contacto ?? opts.telefono ?? "Llamada"}`
    });
    return { ok: false, analizada: false, itemId, itemName, telefono: opts.telefono ?? null, contacto: opts.contacto ?? null, motivo };
  }

  const result = await handleOrchestratorEvent({
    eventType: "call_recorded",
    item: { itemId, itemName },
    payload: { transcript, telefono: opts.telefono ?? null, audioUrl: url }
  });

  return { ok: true, analizada: true, itemId, itemName, telefono: opts.telefono ?? null, contacto: opts.contacto ?? null, result };
}
