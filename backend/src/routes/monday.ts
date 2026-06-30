import { Router } from "express";
import { getBoardColumns, isMondayMockMode } from "../lib/monday.js";

// ===========================================================================
//  Utilidades de Monday (admin) — lectura del board para mapear columnas.
//   GET /api/monday/columns → lista id/título/tipo de columnas del board de Leads.
//  Sirve para construir MONDAY_COLUMN_MAP con los IDs reales.
// ===========================================================================

export const mondayRouter = Router();

mondayRouter.get("/columns", async (req, res) => {
  if (isMondayMockMode) {
    return res.status(400).json({ error: "MONDAY_API_TOKEN no configurado (modo mock)." });
  }
  // Permite inspeccionar cualquier board con ?boardId= (def. el de Leads).
  const boardId = (req.query.boardId as string | undefined)?.trim() || process.env.MONDAY_BOARD_ID_LEADS;
  if (!boardId) {
    return res.status(400).json({ error: "MONDAY_BOARD_ID_LEADS no configurado." });
  }
  try {
    const columns = await getBoardColumns(boardId);
    res.json({ boardId, total: columns.length, columns });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
