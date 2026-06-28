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

  if (input.columnUpdates) {
    for (const [columnId, value] of Object.entries(input.columnUpdates)) {
      await updateMondayColumn({
        boardId: BOARD_ID,
        itemId: input.itemId,
        columnId,
        value
      });
      columnsUpdated.push(columnId);
    }
  }

  if (input.subitems) {
    for (const sub of input.subitems) {
      await createMondaySubitem({
        parentItemId: input.itemId,
        itemName: sub.name,
        columnValues: sub.columnValues
      });
      subitemsCreated += 1;
    }
  }

  if (input.comment) {
    await postMondayComment({ itemId: input.itemId, body: input.comment });
    commentPosted = true;
  }

  return {
    written: true,
    columnsUpdated,
    subitemsCreated,
    commentPosted
  };
}

export { isMondayMockMode };
