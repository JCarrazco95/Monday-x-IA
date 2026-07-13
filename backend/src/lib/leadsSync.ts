import { db } from "../db/index.js";
import { getLeadsBoardItems, leadsBoardConfigured } from "./monday.js";
import { mapLeadColumns } from "./leadColumns.js";
import { logActivity } from "./activityLog.js";
import { handleOrchestratorEvent } from "../agents/orchestratorAgent.js";

// ===========================================================================
//  Sync del tablero de Leads — red de seguridad del webhook nativo de Monday.
//
//  El webhook (`routes/webhooks.ts` -> POST /api/webhooks/monday) analiza un
//  lead EN CUANTO Monday lo llama, pero eso requiere que el webhook esté
//  registrado en Monday y que el backend tenga una URL pública HTTPS
//  (`docs/DESPLIEGUE-MONDAY.md` §8). Si no está configurado (o se está
//  probando en local), los items creados directo en el board nunca se
//  analizan. Este sync es el mismo patrón ya usado para el tablero de
//  llamadas de Aircall (`aircallIngest.ts` -> syncCallsBoard): revisa
//  periódicamente el tablero y analiza lo que falte, sin depender del
//  webhook. Idempotente: `lead_analyses.item_id` ya dice qué está analizado.
// ===========================================================================

const LEADS_SYNC_MAX = Number(process.env.LEADS_SYNC_MAX ?? 25);

export interface LeadsSyncResult {
  leidos: number;
  analizados: number;
  yaAnalizados: number;
  errores: string[];
  detalle: { itemName: string; estado: string }[];
}

/** itemIds ya presentes en la tabla de dominio (A.3) — no se re-analizan. */
async function analyzedLeadItemIds(): Promise<Set<string>> {
  const rows = await db.query<{ item_id: string }>(`SELECT item_id FROM lead_analyses`, []);
  return new Set(rows.map((r) => r.item_id));
}

export async function syncLeadsBoard(opts: { max?: number } = {}): Promise<LeadsSyncResult> {
  const out: LeadsSyncResult = { leidos: 0, analizados: 0, yaAnalizados: 0, errores: [], detalle: [] };
  if (!leadsBoardConfigured) {
    throw new Error("Falta MONDAY_BOARD_ID_LEADS (tablero de leads).");
  }

  const max = Math.max(1, opts.max ?? LEADS_SYNC_MAX);
  const items = await getLeadsBoardItems();
  out.leidos = items.length;
  const analyzed = await analyzedLeadItemIds();

  for (const it of items) {
    if (out.analizados >= max) break;
    if (analyzed.has(it.itemId)) {
      out.yaAnalizados++;
      continue;
    }

    try {
      const payload = mapLeadColumns(it.columns, it.itemName);
      logActivity({
        agentId: "orchestrator",
        type: "info",
        title: "Lead detectado en el tablero (sync)",
        detail: `${payload.nombre}${payload.razonSocial ? ` — ${payload.razonSocial}` : ""}`,
        reference: `#${it.itemId} · ${it.itemName}`
      });
      await handleOrchestratorEvent({
        eventType: "lead_created",
        item: { itemId: it.itemId, itemName: it.itemName },
        payload
      });
      out.analizados++;
      analyzed.add(it.itemId);
      out.detalle.push({ itemName: it.itemName, estado: "analizado" });
    } catch (err) {
      out.errores.push(`${it.itemName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return out;
}
