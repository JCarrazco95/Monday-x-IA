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
import { getCallsBoardItems, callsBoardConfigured } from "./monday.js";
import { db } from "../db/index.js";

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

// ===========================================================================
//  Sincronización del TABLERO DE LLAMADAS de Aircall en Monday.
//
//  Lee los items del tablero de llamadas (call id, link, lead relacionado) y,
//  por cada llamada aún no analizada, trae la transcripción (por call id vía
//  Aircall, o por el link de la grabación) y la analiza. El resultado aparece
//  en Call Intelligence ligado al lead. Idempotente: no re-analiza lo ya hecho.
// ===========================================================================
export interface CallsSyncResult {
  leidas: number;
  analizadas: number;
  yaAnalizadas: number;
  sinFuente: number;
  errores: { itemName: string; motivo: string }[];
  detalle: { itemName: string; estado: string }[];
}

const CALLS_SYNC_MAX = Number(process.env.CALLS_SYNC_MAX ?? 25);
// "De aquí en adelante": solo se analizan llamadas iniciadas en/después de esta
// fecha ISO. Configúralo (p. ej. 2026-07-03) para ignorar el histórico.
const CALLS_SYNC_SINCE = process.env.CALLS_SYNC_SINCE;

/** itemIds de llamadas ya analizadas (desde la bitácora) para no repetir. */
async function analyzedCallItemIds(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const rows = await db.query<{ reference: string }>(
      `SELECT DISTINCT reference FROM logs WHERE agent_id = 'call_intelligence' AND reference IS NOT NULL`,
      []
    );
    for (const r of rows) {
      const m = r.reference?.match(/^#(\S+)\s*·/);
      if (m?.[1]) set.add(m[1]);
    }
  } catch { /* noop */ }
  return set;
}

export async function syncCallsBoard(opts: { max?: number; sinceISO?: string } = {}): Promise<CallsSyncResult> {
  const out: CallsSyncResult = { leidas: 0, analizadas: 0, yaAnalizadas: 0, sinFuente: 0, errores: [], detalle: [] };
  if (!callsBoardConfigured) {
    throw new Error("Falta MONDAY_BOARD_ID_CALLS (tablero de llamadas de Aircall).");
  }

  const max = Math.max(1, opts.max ?? CALLS_SYNC_MAX);
  const sinceISO = opts.sinceISO ?? CALLS_SYNC_SINCE;

  let items = await getCallsBoardItems(); // ya vienen más recientes primero
  // "De aquí en adelante": ignora llamadas anteriores al corte de fecha.
  if (sinceISO) items = items.filter((it) => it.startedAt && it.startedAt >= sinceISO);
  out.leidas = items.length;
  const analyzed = await analyzedCallItemIds();

  for (const it of items) {
    if (out.analizadas >= max) break;
    const link = it.link;
    const nombre = it.leadName ?? it.itemName;
    // El ID NUMÉRICO de Aircall viene en el link (assets.aircall.io/calls/<id>/recording);
    // la columna "Call ID" suele traer el SID de Twilio (CA…), que no sirve para la API.
    const aircallId =
      link?.match(/\/calls\/(\d+)/)?.[1] ?? (it.callId && /^\d+$/.test(it.callId) ? it.callId : null);

    // Ids candidatos con los que se guardaría el análisis (para deduplicar).
    const urlHash = link ? crypto.createHash("md5").update(link).digest("hex").slice(0, 10) : null;
    const candidatos = [aircallId ? `aircall-${aircallId}` : null, urlHash ? `url-${urlHash}` : null].filter(Boolean) as string[];
    if (candidatos.some((c) => analyzed.has(c))) {
      out.yaAnalizadas++;
      out.detalle.push({ itemName: nombre, estado: "ya analizada" });
      continue;
    }

    if (!aircallId && !link) {
      out.sinFuente++;
      out.detalle.push({ itemName: nombre, estado: "sin grabación ni ID" });
      continue;
    }

    try {
      // 1) Por ID numérico de Aircall: trae su transcripción oficial (sin gastar Deepgram).
      let res = aircallId ? await ingestAircallCall(aircallId, { contactoHint: nombre }) : null;
      // 2) Si no se logró y hay link a la grabación, transcribe el audio (Deepgram).
      if ((!res || !res.analizada) && link) {
        res = await ingestCallFromUrl({ url: link, contacto: nombre });
      }
      if (res?.analizada) {
        out.analizadas++;
        if (res.itemId) analyzed.add(res.itemId);
        out.detalle.push({ itemName: nombre, estado: "analizada" });
      } else {
        out.errores.push({ itemName: nombre, motivo: res?.motivo ?? "No se pudo obtener la transcripción." });
        out.detalle.push({ itemName: nombre, estado: "sin transcripción" });
      }
    } catch (err) {
      out.errores.push({ itemName: nombre, motivo: err instanceof Error ? err.message : String(err) });
    }
  }

  logActivity({
    agentId: "call_intelligence",
    type: out.errores.length ? "warning" : "success",
    title: "Sincronización del tablero de llamadas (Aircall)",
    detail: `${out.leidas} leídas · ${out.analizadas} analizadas · ${out.yaAnalizadas} ya estaban · ${out.errores.length} con error`,
    reference: `calls-sync`
  });

  return out;
}
