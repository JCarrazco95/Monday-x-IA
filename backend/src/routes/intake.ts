import { Router } from "express";
import { handleOrchestratorEvent } from "../agents/orchestratorAgent.js";
import { createMondayItem, isMondayMockMode } from "../lib/monday.js";
import { logActivity } from "../lib/activityLog.js";

// ===========================================================================
//  Captación de leads desde una landing page.
//
//  Flujo que simula producción:
//    Landing page  ->  POST /api/leads/intake
//      1) Se crea el item del lead en Monday (mock o real).
//      2) Se dispara AUTOMÁTICAMENTE el análisis (lead_created) — sin botón.
//
//  En producción este endpoint es el que llamaría la landing (o Make) al
//  enviarse el formulario.
// ===========================================================================

export const intakeRouter = Router();

intakeRouter.post("/intake", async (req, res) => {
  const { nombre, email, telefono, razonSocial, rfc, mensaje } = (req.body ?? {}) as Record<
    string,
    string | undefined
  >;

  if (!nombre?.trim() && !razonSocial?.trim()) {
    return res.status(400).json({ error: "Se requiere al menos 'nombre' o 'razonSocial'." });
  }

  const itemName = (nombre?.trim() || razonSocial?.trim()) as string;

  try {
    // 1) Crear el lead en Monday (en mock devuelve un id simulado).
    const created = await createMondayItem({ itemName });
    const itemId = created?.create_item?.id ?? String(Date.now());

    logActivity({
      agentId: "orchestrator",
      type: "info",
      title: "Lead recibido desde landing page",
      detail: `${itemName}${razonSocial ? ` — ${razonSocial}` : ""}${mensaje ? ` · "${mensaje.slice(0, 120)}"` : ""}`,
      reference: `#${itemId} · ${itemName}`
    });

    // 2) Disparar el análisis automáticamente.
    const result = await handleOrchestratorEvent({
      eventType: "lead_created",
      item: { itemId, itemName },
      payload: { nombre: nombre ?? itemName, email, telefono, razonSocial, rfc, mensaje }
    });

    res.json({ itemId, itemName, mondayMock: isMondayMockMode, result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
