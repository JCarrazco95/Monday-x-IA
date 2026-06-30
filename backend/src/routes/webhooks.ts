import { Router } from "express";
import crypto from "node:crypto";
import { handleOrchestratorEvent } from "../agents/orchestratorAgent.js";
import { getMondayItem } from "../lib/monday.js";
import { logActivity } from "../lib/activityLog.js";
import { ingestAircallCall } from "../lib/aircallIngest.js";

// ===========================================================================
//  Webhook NATIVO de Monday.com.
//
//  Monday llama a este endpoint cuando se crea un item en el board de Leads:
//   1. Verificación inicial: Monday envía { challenge } y espera recibirlo de vuelta.
//   2. Eventos: Monday envía { event: { pulseId, pulseName, boardId, ... } } y
//      firma la petición con un JWT (header Authorization) usando el signing
//      secret de la app (MONDAY_WEBHOOK_SECRET).
//
//  Al recibir un item nuevo: lee sus columnas, mapea el lead y dispara el
//  análisis IA automáticamente (handleOrchestratorEvent).
// ===========================================================================

export const webhooksRouter = Router();

const SECRET = process.env.MONDAY_WEBHOOK_SECRET;
const VERIFY = Boolean(SECRET) && SECRET !== "changeme";

// Permite forzar el id de columna por env (si el match por título no basta).
const COL = {
  email: process.env.MONDAY_COL_EMAIL,
  telefono: process.env.MONDAY_COL_TELEFONO,
  razonSocial: process.env.MONDAY_COL_RAZON_SOCIAL,
  rfc: process.env.MONDAY_COL_RFC,
  nombre: process.env.MONDAY_COL_NOMBRE
};

/** Verifica el JWT (HS256) que Monday adjunta en el header Authorization. */
function verifyMondaySignature(authHeader?: string): boolean {
  if (!VERIFY) return true; // en pruebas/sin secret, no se exige firma
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac("sha256", SECRET as string).update(`${h}.${p}`).digest("base64url");
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

type Col = { id: string; title: string; text: string };
function pick(cols: Col[], envId: string | undefined, re: RegExp): string | undefined {
  if (envId) {
    const byId = cols.find((c) => c.id === envId)?.text;
    if (byId) return byId;
  }
  const byTitle = cols.find((c) => re.test(c.title))?.text;
  return byTitle || undefined;
}

webhooksRouter.post("/monday", async (req, res) => {
  const body = (req.body ?? {}) as { challenge?: string; event?: Record<string, unknown> };

  // 1) Handshake de verificación
  if (body.challenge) return res.json({ challenge: body.challenge });

  // 2) Firma
  if (!verifyMondaySignature(req.headers.authorization)) {
    return res.status(401).json({ error: "Firma de webhook inválida." });
  }

  const ev = body.event ?? {};
  const itemId = String((ev.pulseId ?? ev.itemId ?? "") as string | number);
  const itemName = (ev.pulseName ?? ev.itemName ?? `Item ${itemId}`) as string;
  if (!itemId) return res.status(200).json({ ignored: "sin itemId" });

  try {
    const item = await getMondayItem(itemId);
    const cols: Col[] = item?.columns ?? [];

    const payload = {
      nombre: pick(cols, COL.nombre, /nombre|contacto|name/i) ?? itemName,
      email: pick(cols, COL.email, /email|correo|mail/i),
      telefono: pick(cols, COL.telefono, /tel|phone|cel|whats/i),
      razonSocial: pick(cols, COL.razonSocial, /raz[oó]n|empresa|company|negocio/i),
      rfc: pick(cols, COL.rfc, /rfc/i)
    };

    logActivity({
      agentId: "orchestrator",
      type: "info",
      title: "Lead recibido desde Monday (webhook)",
      detail: `${payload.nombre}${payload.razonSocial ? ` — ${payload.razonSocial}` : ""}`,
      reference: `#${itemId} · ${itemName}`
    });

    const result = await handleOrchestratorEvent({
      eventType: "lead_created",
      item: { itemId, itemName },
      payload
    });

    res.json({ ok: true, analizada: true, itemId, result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ===========================================================================
//  Webhook de AIRCALL — ingesta de llamada + transcripcion.
//
//  Aircall envia eventos ("call.ended" / "call.transcription_available") a esta
//  URL. Tomamos la llamada, conseguimos la transcripcion (Aircall AI o, como
//  fallback, Deepgram sobre la grabacion) y disparamos el analisis (4 pasadas).
//  La llamada aparece en Call Intelligence (board) y por telefono en el Item View.
//  Config Aircall: Integrations & API -> Webhooks -> https://TU_DOMINIO/api/webhooks/aircall
// ===========================================================================

interface AircallWebhookBody {
  event?: string;
  token?: string;
  data?: {
    id?: number | string;
    raw_digits?: string;
    direction?: string;
    contact?: { name?: string; first_name?: string; last_name?: string } | null;
    recording?: string | null;
  };
}

const AIRCALL_WEBHOOK_TOKEN = process.env.AIRCALL_WEBHOOK_TOKEN;

webhooksRouter.post("/aircall", async (req, res) => {
  const body = (req.body ?? {}) as AircallWebhookBody;

  if (AIRCALL_WEBHOOK_TOKEN && body.token && body.token !== AIRCALL_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: "Token de webhook Aircall invalido." });
  }

  const event = body.event ?? "";
  const interesa = /ended|transcription|recording|hung_up/i.test(event) || !event;
  const data = body.data ?? {};
  const callId = data.id;
  if (!interesa || !callId) {
    return res.status(200).json({ ignored: `evento sin procesar: ${event || "desconocido"}` });
  }

  try {
    const contactoHint =
      data.contact?.name ??
      ([data.contact?.first_name, data.contact?.last_name].filter(Boolean).join(" ") || null);

    const out = await ingestAircallCall(callId, {
      numeroHint: data.raw_digits ?? null,
      contactoHint,
      recordingHint: data.recording ?? null
    });

    // Sin transcripción: respondemos 200 (no reintentar) con el motivo.
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
