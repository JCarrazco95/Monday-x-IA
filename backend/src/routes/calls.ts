import { Router } from "express";
import { db } from "../db/index.js";
import { listCallsByPhone, aircallEnabled } from "../lib/aircall.js";
import { ingestAircallCall, ingestCallFromUrl, ingestCallFromTranscript, syncCallsBoard } from "../lib/aircallIngest.js";
import { getCallsBoardItems, callsBoardConfigured } from "../lib/monday.js";
import type { CallIntelligenceOutput } from "../agents/types.js";

// ===========================================================================
//  Call Intelligence — historial de llamadas analizadas (Sandler + Challenger).
//  Lee la TABLA DE DOMINIO `call_analyses` (A.3): una fila indexada por
//  llamada con el último análisis. La bitácora (`logs`) queda como auditoría;
//  el write-through del orquestador y el backfill de arranque mantienen la
//  tabla al día.
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

/** ¿El texto es (casi) puro un número telefónico? (Aircall sin contacto con nombre). */
export function looksLikePhone(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7) return false;
  // Sin el separador (espacios/+/-/paréntesis) casi todo son dígitos.
  return digits.length >= trimmed.replace(/[\s()+-]/g, "").length;
}

/**
 * Nombre del LEAD por teléfono (tabla de dominio `lead_analyses`, indexada).
 * Cuando Aircall no trae un contacto con nombre, el prospecto de la llamada
 * queda como el número crudo; si ese teléfono coincide con un lead ya
 * calificado, se usa su nombre en vez del número.
 */
async function leadNamesByPhone(): Promise<Map<string, string>> {
  const rows = await db.query<{ item_name: string; telefono: string | null }>(
    `SELECT item_name, telefono FROM lead_analyses WHERE telefono IS NOT NULL`
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = normPhone(r.telefono);
    if (key.length >= 7 && !map.has(key)) map.set(key, r.item_name);
  }
  return map;
}

/** Prospecto a mostrar: nombre del lead si el que teníamos era solo el teléfono. */
export function resolveProspecto(itemName: string, telefono: string | null | undefined, leadNames: Map<string, string>): string {
  const base = prospecto(itemName);
  if (telefono && looksLikePhone(base)) {
    const nombre = leadNames.get(normPhone(telefono));
    if (nombre) return nombre;
  }
  return base;
}

function isoUtc(ts: string | null): string | null {
  if (!ts) return null;
  return ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
}

interface AnalyzedRow {
  item_id: string;
  item_name: string;
  payload: string;
  analyzed_at: string;
}

async function listAnalyzedRows(): Promise<AnalyzedRow[]> {
  return db.query<AnalyzedRow>(
    `SELECT item_id, item_name, payload, analyzed_at
       FROM call_analyses
      ORDER BY analyzed_at DESC, id DESC`
  );
}

function toListItem(row: AnalyzedRow, leadNames: Map<string, string>) {
  const { item_id: itemId, item_name: itemName } = row;
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
  // Temas de la conversación (temas tratados + objeciones), deduplicados,
  // para los chips de filtro del historial.
  const temasSet = new Map<string, string>();
  for (const raw of [...(call.analisisProfundo?.temasTratados ?? []), ...(call.objeciones ?? [])]) {
    const t = raw?.trim();
    if (t) temasSet.set(t.toLowerCase().replace(/\s+/g, " "), t);
  }
  return {
    itemId,
    idLlamada: `#${itemId}`,
    prospecto: resolveProspecto(itemName, call.telefono, leadNames),
    vendedor: call.vendedorNombre ?? null,
    fecha: isoUtc(row.analyzed_at),
    sentimiento: call.sentimiento ?? null,
    sandlerScore: sScore,
    sandlerBanda: sBanda as Banda,
    challengerScore: ch?.score ?? null,
    challengerBanda: (ch?.banda ?? null) as Banda | null,
    perfilVendedor: ch?.perfilVendedor ?? null,
    globalScore: integ?.scoreGlobal ?? null,
    globalBanda: (integ?.banda ?? null) as Banda | null,
    telefono: call.telefono ?? null,
    resumen: integ?.resumenEjecutivo ?? call.resumen ?? null,
    temas: [...temasSet.values()]
  };
}

// GET /api/calls/analyzed -> lista de llamadas analizadas (Sandler + Challenger).
//   Filtros opcionales: ?phone= &vendedor= &banda=(rojo|amarillo|verde)
//   &desde=YYYY-MM-DD &hasta=YYYY-MM-DD &q=texto &minGlobal=NN &tema=texto
callsRouter.get("/analyzed", async (req, res) => {
  try {
    const Q = req.query as Record<string, string | undefined>;
    const phone = normPhone(Q.phone);
    const leadNames = await leadNamesByPhone();
    let items = (await listAnalyzedRows())
      .map((r) => toListItem(r, leadNames))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (phone.length >= 7) items = items.filter((i) => normPhone(i.telefono) === phone);

    // --- Filtros de búsqueda ---
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (Q.vendedor?.trim()) {
      const v = norm(Q.vendedor.trim());
      items = items.filter((i) => i.vendedor && norm(i.vendedor).includes(v));
    }
    if (Q.banda && ["rojo", "amarillo", "verde"].includes(Q.banda)) {
      items = items.filter((i) => (i.globalBanda ?? i.sandlerBanda) === Q.banda);
    }
    // Fechas: comparación por prefijo ISO (la fecha viene en ISO UTC).
    if (Q.desde?.trim()) items = items.filter((i) => (i.fecha ?? "") >= Q.desde!.trim());
    if (Q.hasta?.trim()) items = items.filter((i) => (i.fecha ?? "") <= Q.hasta!.trim() + "T23:59:59Z");
    if (Q.q?.trim()) {
      const q = norm(Q.q.trim());
      items = items.filter((i) =>
        norm(i.prospecto).includes(q) ||
        norm(i.resumen ?? "").includes(q) ||
        norm(i.vendedor ?? "").includes(q) ||
        i.idLlamada.toLowerCase().includes(q)
      );
    }
    const minGlobal = Number(Q.minGlobal);
    if (Number.isFinite(minGlobal) && minGlobal > 0) {
      items = items.filter((i) => (i.globalScore ?? i.sandlerScore) >= minGlobal);
    }
    // Filtro por tema de conversación (match parcial, sin acentos).
    if (Q.tema?.trim()) {
      const t = norm(Q.tema.trim());
      items = items.filter((i) => i.temas.some((x) => norm(x).includes(t)));
    }
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

// GET /api/calls/biblioteca -> C.5: "mejores llamadas" para entrenamiento.
//   Llamadas con score global >= min (def. 75) + su material didáctico
//   (momento clave, citas destacadas, momentos positivos, fortalezas).
callsRouter.get("/biblioteca", async (req, res) => {
  try {
    const min = Number(req.query.min) || 75;
    // Prefiltro por índice (global_score) y detalle desde el payload.
    const rows = await db.query<AnalyzedRow>(
      `SELECT item_id, item_name, payload, analyzed_at
         FROM call_analyses
        WHERE COALESCE(global_score, sandler_score, 0) >= ?
        ORDER BY COALESCE(global_score, sandler_score, 0) DESC`,
      [min]
    );
    const leadNames = await leadNamesByPhone();
    const mejores = [];
    for (const row of rows) {
      let call: CallIntelligenceOutput;
      try { call = JSON.parse(row.payload) as CallIntelligenceOutput; } catch { continue; }
      const score = call.integrado?.scoreGlobal ?? call.sandler?.puntajeFinal ?? 0;
      if (score < min) continue;
      mejores.push({
        itemId: row.item_id,
        prospecto: resolveProspecto(row.item_name, call.telefono, leadNames),
        vendedor: call.vendedorNombre ?? null,
        fecha: isoUtc(row.analyzed_at),
        globalScore: Math.round(score),
        sandlerScore: Math.round(call.sandler?.puntajeFinal ?? 0),
        challengerScore: Math.round(call.challenger?.score ?? 0),
        resumen: call.integrado?.resumenEjecutivo ?? call.resumen ?? null,
        // Material didáctico para entrenar nuevos vendedores:
        momentoClave: call.sandler?.momentoClave ?? null,
        fortalezas: call.sandler?.fortalezas ?? [],
        citasDestacadas: call.analisisProfundo?.citasDestacadas ?? [],
        momentosPositivos: (call.analisisProfundo?.momentos ?? []).filter((m) => m.tipo === "positivo")
      });
    }
    mejores.sort((a, b) => b.globalScore - a.globalScore);
    res.json({ min, total: mejores.length, llamadas: mejores });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/calls/analyzed/:itemId -> analisis completo de una llamada.
//   Lookup directo por item_id (índice UNIQUE), antes un LIKE sobre logs.
callsRouter.get("/analyzed/:itemId", async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const row = await db.queryOne<AnalyzedRow>(
      `SELECT item_id, item_name, payload, analyzed_at FROM call_analyses WHERE item_id = ?`,
      [itemId]
    );
    if (!row) return res.status(404).json({ error: "Llamada no encontrada" });

    const call = JSON.parse(row.payload) as CallIntelligenceOutput;

    // Llamadas analizadas ANTES de que el análisis guardara la transcripción:
    // se recupera del evento que registró el orquestador en la bitácora
    // (payload = OrchestratorEvent con payload.transcript). Solo lectura.
    if (!call.transcript) {
      const evt = await db.queryOne<{ payload: string }>(
        `SELECT payload FROM logs
          WHERE agent_id = 'orchestrator' AND reference LIKE ? AND payload LIKE '%"transcript"%'
          ORDER BY id DESC LIMIT 1`,
        [`#${itemId} ·%`]
      );
      if (evt?.payload) {
        try {
          const parsed = JSON.parse(evt.payload) as { payload?: { transcript?: string } };
          if (parsed?.payload?.transcript) call.transcript = parsed.payload.transcript;
        } catch { /* payload corrupto: se omite */ }
      }
    }

    const leadNames = await leadNamesByPhone();
    res.json({
      itemId,
      idLlamada: `#${itemId}`,
      prospecto: resolveProspecto(row.item_name, call.telefono, leadNames),
      itemName: row.item_name,
      fecha: isoUtc(row.analyzed_at),
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
  const { transcript, prospecto, telefono, vendedor } = (req.body ?? {}) as {
    transcript?: string; prospecto?: string; telefono?: string; vendedor?: string;
  };
  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "Se requiere 'transcript' (texto de la conversación)." });
  }
  try {
    const out = await ingestCallFromTranscript({
      transcript,
      prospecto: typeof prospecto === "string" && prospecto.trim() ? prospecto.trim() : null,
      telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null,
      vendedor: typeof vendedor === "string" && vendedor.trim() ? vendedor.trim() : null
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
  const { url, telefono, contacto, vendedor } = (req.body ?? {}) as {
    url?: string; telefono?: string; contacto?: string; vendedor?: string;
  };
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "Se requiere 'url' (enlace a la grabación de audio)." });
  }
  try {
    const out = await ingestCallFromUrl({
      url: url.trim(),
      telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null,
      contacto: typeof contacto === "string" && contacto.trim() ? contacto.trim() : null,
      vendedor: typeof vendedor === "string" && vendedor.trim() ? vendedor.trim() : null
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
