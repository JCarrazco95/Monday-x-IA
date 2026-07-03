import {
  createMondaySubitem,
  postMondayComment,
  updateMondayColumn,
  isMondayMockMode
} from "../lib/monday.js";
import type { MondayWriteInput, MondayWriteOutput } from "./types.js";

export const AGENT_ID = "monday_writer";

const BOARD_ID = process.env.MONDAY_BOARD_ID_LEADS ?? "";

/**
 * Mapa de columnas: traduce la clave lógica que usan los agentes
 * (ej. "score_lead") al ID real de la columna en Monday (ej. "numeric_mkp1").
 * Se configura con la variable de entorno MONDAY_COLUMN_MAP (un JSON).
 *
 * Comportamiento:
 *  - Si HAY mapa configurado: solo se escriben las columnas mapeadas; cualquier
 *    clave sin mapeo se OMITE (jamás se toca una columna que no diste → no se
 *    disparan automatizaciones ajenas ni se rompe nada).
 *  - Si NO hay mapa (dev/demo): passthrough (se usa la clave lógica tal cual),
 *    para que la demo siga mostrando todo en la bitácora.
 */
const COLUMN_MAP: Record<string, string> = (() => {
  const raw = process.env.MONDAY_COLUMN_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("[mondayWriter] MONDAY_COLUMN_MAP no es JSON válido; se ignora:", err);
    return {};
  }
})();
const HAS_COLUMN_MAP = Object.keys(COLUMN_MAP).length > 0;

/** Devuelve el ID real de columna, o null si debe omitirse. */
function resolveColumnId(logicalKey: string): string | null {
  if (!HAS_COLUMN_MAP) return logicalKey; // dev/demo: passthrough
  return COLUMN_MAP[logicalKey] ?? null;  // prod: solo lo mapeado
}

/**
 * Aplica los resultados de los demás agentes al item correspondiente en Monday:
 * actualiza columnas, crea subitems (p.ej. tareas/compromisos) y publica un
 * comentario con el resumen del análisis.
 *
 * En modo mock (sin MONDAY_API_TOKEN) no hace llamadas reales pero registra
 * exactamente qué habría escrito, para poder revisarlo en la bitácora.
 */
export async function runMondayWriterAgent(input: MondayWriteInput): Promise<MondayWriteOutput> {
  const columnsUpdated: string[] = [];
  let subitemsCreated = 0;
  let commentPosted = false;

  const skipped: string[] = [];

  // Guarda de seguridad: si el itemId NO es un id real de Monday (numérico) —p.ej.
  // análisis de llamadas con id "aircall-…", "url-…", "call-…"— NO intentamos
  // escribir en Monday. El análisis se guarda solo en nuestra bitácora.
  if (!/^\d+$/.test(String(input.itemId))) {
    return { written: false, columnsUpdated: [], subitemsCreated: 0, commentPosted: false };
  }

  if (input.columnUpdates) {
    for (const [logicalKey, value] of Object.entries(input.columnUpdates)) {
      const columnId = resolveColumnId(logicalKey);
      if (!columnId) {
        skipped.push(logicalKey); // no mapeada → nunca se toca
        continue;
      }
      try {
        await updateMondayColumn({ boardId: BOARD_ID, itemId: input.itemId, columnId, value });
        columnsUpdated.push(logicalKey);
      } catch (err) {
        // Una columna que falla (ID inexistente, etc.) NO debe romper las demás.
        skipped.push(logicalKey);
        console.error(`[mondayWriter] columna "${logicalKey}" (${columnId}) falló:`, err instanceof Error ? err.message : err);
      }
    }
  }

  if (input.subitems) {
    for (const sub of input.subitems) {
      try {
        await createMondaySubitem({ parentItemId: input.itemId, itemName: sub.name, columnValues: sub.columnValues });
        subitemsCreated += 1;
      } catch (err) {
        console.error("[mondayWriter] subitem falló:", err instanceof Error ? err.message : err);
      }
    }
  }

  if (input.comment) {
    try {
      await postMondayComment({ itemId: input.itemId, body: input.comment });
      commentPosted = true;
    } catch (err) {
      console.error("[mondayWriter] comentario falló:", err instanceof Error ? err.message : err);
    }
  }

  if (skipped.length) {
    console.warn(`[mondayWriter] columnas omitidas (sin mapeo o con error): ${skipped.join(", ")}`);
  }

  return {
    written: true,
    columnsUpdated,
    subitemsCreated,
    commentPosted
  };
}

export { isMondayMockMode };
