import { Router } from "express";
import { db } from "../db/index.js";
import { listCallsByPhone, aircallEnabled } from "../lib/aircall.js";
import { ingestAircallCall, ingestCallFromUrl, ingestCallFromTranscript, syncCallsBoard } from "../lib/aircallIngest.js";
import { getCallsBoardItems, callsBoardConfigured } from "../lib/monday.js";
import { parseReference } from "../lib/references.js";
import type { CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Call Intelligence — historial de llamadas analizadas (Sandler + Challenger).
//  El analisis de cada llamada vive en la bitacora (logs) como el payload que
//  dejo el agente "call_intelligence". Lo listamos para la pagina Call
//  Intelligence, de modo que cada llamada simulada/real aparezca en vivo.
// ===========================================================================

export const callsRouter = Router();

type Banda = "rojo" | "amarillo" | "verde";

function bandaFromScore(score: number): Banda {
  return score >= 75 ? "verde" : score >= 50 ? "amarillo" : "rojo";
}

function sandlerScore(c: CallIntelligenceOutput): number {
  return c.probabilidadCierre === "alta" ? 85 : c.probabilidadCierre === "media" ? 60 : c.probabilidadCierre === "baja" ? 35 : 50;
}

function prospecto(itemName: string): string {
  return itemName.replace(/^Llamada\s*[—–-]\s*/i, "").trim() || itemName;
}

function normPhone(p?: string | null): string {
  return (p ?? "").replace(/[^0-9]/g, "").slice(-10);
}

function isoUtc(ts: string | null): string | null {
  if (!ts) return null;
  return ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
}

interface AnalyzedRow {
  reference: string;
  payload: string;
  timestamp: string;
  duration_ms: number | null;
}

async function listAnalyzedRows(): Promise<AnalyzedRow[]> {
  return db.query<AnalyzedRow>(
    `SELECT l.reference, l.payload, l.timestamp, l.duration_ms
         FROM logs l
         JOIN (
           SELECT reference, MAX(id) AS mid
             FROM logs
            WHERE agent_id = 'call_intelligence' AND payload IS NOT NULL AND reference IS NOT NULL
            GROUP BY reference
         ) m ON l.id = m.mid
        ORDER BY l.timestamp DESC, l.id DESC`
  );
}

function toListItem(row: AnalyzedRow) {
  const { itemId, itemName } = parseReference(row.reference);
  let call: CallIntelligenceOutput;
  try {
    call = JSON.parse(row.payload) as CallIntelligenceOutput;
  } catch {
    return null;
  }
  const sScore = call.sandler?.puntajeFinal ?? sandlerScore(call);
  const sBanda = call.sandler?.banda ?? bandaFromScore(sScore);
  const ch = call.challenger ?? null;
  const integ = call.integrado ?? null;
  return {
    itemId,
    idLlamada: `#${itemId}`,
    prospecto: prospecto(itemName),
    vendedor: call.vendedorNombre ?? null,
    fecha: isoUtc(row.timestamp),
    sentimiento: call.sentimiento ?? null,
    sandlerScore: sScore,
    sandlerBanda: sBanda as Banda,
    challengerScore: ch?.score ?? null,
    challengerBanda: (ch?.banda ?? null) as Banda | null,
    perfilVendedor: ch?.perfilVendedor ?? null,
    globalScore: integ?.scoreGlobal ?? null,
    globalBanda: (integ?.banda ?? null) as Banda | null,
    telefono: call.telefono ?? null,
    resumen: integ?.resumenEjecutivo ?? call.resumen ?? null
  };
}

// GET /api/calls/analyzed -> lista de llamadas analizadas (Sandler + Challenger).
callsRouter.get("/analyzed", async (req, res) => {
  try {
    const phone = normPhone(req.query.phone as string | undefined);
    let items = (await listAnalyzedRows())
      .map(toListItem)
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (phone.length >= 7) items = items.filter((i) => normPhone(i.telefono) === phone);
    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);
    // "No evaluables": buzones de voz, audio sin conversación, transcripción
    // inservible → la IA devuelve score 0. Se LISTAN (para visibilidad) pero se
    // EXCLUYEN de promedios y semáforos, que miden calidad de venta real.
    const evaluables = items.filter((i) => i.sandlerScore > 0);
    const challengerScores = evaluables.map((i) => i.challengerScore).filter((n): n is number => n !== null);
    const globalScores = evaluables.map((i) => i.globalScore).filter((n): n is number => n !== null);
    res.json({
      stats: {
        total: items.length,
        noEvaluables: items.length - evaluables.length,
        sandlerPromedio: avg(evaluables.map((i) => i.sandlerScore)),
        challengerPromedio: avg(challengerScores),
        globalPromedio: avg(globalScores),
        verdes: evaluables.filter((i) => (i.globalBanda ?? i.challengerBanda) === "verde").length,
        rojas: evaluables.filter((i) => (i.globalBanda ?? i.challengerBanda) === "rojo").length
      },
      calls: items
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/calls/analyzed/:itemId -> analisis completo de una llamada.
callsRouter.get("/analyzed/:itemId", async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const row = await db.queryOne<AnalyzedRow>(
      `SELECT reference, payload, timestamp, duration_ms FROM logs
          WHERE agent_id = 'call_intelligence' AND payload IS NOT NULL
            AND reference LIKE ? ORDER BY timestamp DESC, id DESC LIMIT 1`,
      [`#${itemId} ·%`]
    );
    if (!row) return res.status(404).json({ error: "Llamada no encontrada" });

    const { itemName } = parseReference(row.reference);
    const call = JSON.parse(row.payload) as CallIntelligenceOutput;
    res.json({
      itemId,
      idLlamada: `#${itemId}`,
      prospecto: prospecto(itemName),
      itemName,
      fecha: isoUtc(row.timestamp),
      call
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/calls/aircall/:callId -> trae la llamada de Aircall por su ID
//   (grabación + transcripción) y la analiza bajo demanda. Opcional en el body:
//   { transcript } para pegar la transcripción a mano, { telefono } para forzar
//   el número. Devuelve el itemId para abrir el análisis en Call Intelligence.
callsRouter.post("/aircall/:callId", async (req, res) => {
  const callId = req.params.callId?.trim();
  if (!callId) return res.status(400).json({ error: "Se requiere el ID de la llamada." });
  const { transcript, telefono } = (req.body ?? {}) as { transcript?: string; telefono?: string };
  try {
    const out = await ingestAircallCall(callId, {
      transcriptOverride: typeof transcript === "string" && transcript.trim() ? transcript.trim() : null,
      numeroHint: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null
    });
    // Si no se pudo analizar (sin transcripción/credenciales), 422 con el motivo.
    res.status(out.analizada ? 200 : 422).json(out);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/calls/board -> vista previa de las llamadas en el tablero de Aircall.
callsRouter.get("/board", async (_req, res) => {
  try {
    const items = await getCallsBoardItems();
    res.json({ configured: callsBoardConfigured, total: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// Sincronización del tablero de Aircall — ASÍNCRONA.
//
// Analizar llamadas toma minutos (transcripción + 2 pasadas de IA + reintentos
// por cuota); los proxies HTTP (Render/Nginx) cortan a los ~60-100s. Por eso el
// POST ya no espera: arranca el trabajo en segundo plano y responde 202; el
// avance/resultado se consulta en GET /api/calls/sync-status. (El cron interno
// CALLS_SYNC_CRON_HOURS usa el mismo mecanismo sin HTTP.)
// ---------------------------------------------------------------------------
interface SyncState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  result: Awaited<ReturnType<typeof syncCallsBoard>> | null;
  error: string | null;
}
const syncState: SyncState = { running: false, startedAt: null, finishedAt: null, result: null, error: null };

// POST /api/calls/sync-board -> inicia la sincronización (202) o 409 si ya corre.
//   Body opcional: { max } (tope de llamadas a analizar) y { since } (ISO).
callsRouter.post("/sync-board", (req, res) => {
  const { max, since } = (req.body ?? {}) as { max?: number; since?: string };
  if (syncState.running) {
    return res.status(409).json({ running: true, startedAt: syncState.startedAt, error: "Ya hay una sincronización en curso." });
  }
  syncState.running = true;
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.result = null;
  syncState.error = null;

  void syncCallsBoard({
    max: typeof max === "number" && max > 0 ? max : undefined,
    sinceISO: typeof since === "string" && since.trim() ? since.trim() : undefined
  })
    .then((r) => { syncState.result = r; })
    .catch((err) => { syncState.error = err instanceof Error ? err.message : String(err); })
    .finally(() => {
      syncState.running = false;
      syncState.finishedAt = new Date().toISOString();
    });

  res.status(202).json({ started: true, startedAt: syncState.startedAt, status: "GET /api/calls/sync-status" });
});

// GET /api/calls/sync-status -> estado/resultado de la última sincronización.
callsRouter.get("/sync-status", (_req, res) => res.json(syncState));

// POST /api/calls/analyze-transcript -> analiza una transcripción YA EXISTENTE
//   (pegada o traída de otro sistema), sin re-transcribir. Body:
//   { transcript, prospecto?, telefono? }.
callsRouter.post("/analyze-transcript", async (req, res) => {
  const { transcript, prospecto, telefono } = (req.body ?? {}) as {
    transcript?: string; prospecto?: string; telefono?: string;
  };
  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "Se requiere 'transcript' (texto de la conversación)." });
  }
  try {
    const out = await ingestCallFromTranscript({
      transcript,
      prospecto: typeof prospecto === "string" && prospecto.trim() ? prospecto.trim() : null,
      telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null
    });
    res.status(out.analizada ? 200 : 422).json(out);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/calls/from-url -> transcribe (Deepgram) la grabación de una URL y la
//   analiza. Independiente del proveedor (Twilio, Aircall, S3…). Body:
//   { url, telefono?, contacto? }.
callsRouter.post("/from-url", async (req, res) => {
  const { url, telefono, contacto } = (req.body ?? {}) as { url?: string; telefono?: string; contacto?: string };
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "Se requiere 'url' (enlace a la grabación de audio)." });
  }
  try {
    const out = await ingestCallFromUrl({
      url: url.trim(),
      telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null,
      contacto: typeof contacto === "string" && contacto.trim() ? contacto.trim() : null
    });
    res.status(out.analizada ? 200 : 422).json(out);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/calls?phone=<numero>  -> historial de llamadas (Aircall) del cliente.
callsRouter.get("/", async (req, res) => {
  const phone = (req.query.phone as string | undefined) ?? "";
  try {
    const calls = await listCallsByPhone(phone);
    res.json({ enabled: aircallEnabled, calls });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
