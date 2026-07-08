import { Router } from "express";
import { handleOrchestratorEvent } from "../agents/orchestratorAgent.js";
import type { OrchestratorEvent, OrchestratorEventType } from "../agents/types.js";

export const orchestratorRouter = Router();

// POST /api/orchestrator/event - punto de entrada genérico (webhooks Make/Monday)
orchestratorRouter.post("/event", async (req, res) => {
  const { eventType, item, payload } = req.body ?? {};

  const validTypes: OrchestratorEventType[] = ["lead_created", "form_submitted", "call_recorded"];
  if (!validTypes.includes(eventType)) {
    return res.status(400).json({ error: `eventType inválido. Usa: ${validTypes.join(", ")}` });
  }
  if (!item?.itemId || !item?.itemName) {
    return res.status(400).json({ error: "item.itemId e item.itemName son requeridos" });
  }

  const event: OrchestratorEvent = { eventType, item, payload: payload ?? {} };

  try {
    const result = await handleOrchestratorEvent(event);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/orchestrator/simulate/:scenario - escenarios predefinidos para demo
orchestratorRouter.post("/simulate/:scenario", async (req, res) => {
  const scenario = req.params.scenario;

  const scenarios: Record<string, OrchestratorEvent> = {
    form: {
      eventType: "form_submitted",
      item: { itemId: String(2000 + Math.floor(Math.random() * 999)), itemName: "Lead Web — Formulario" },
      payload: {
        formResponses: {
          nombre: "Sofía Ramírez",
          mensaje: "Buenas tardes, somos una empresa (Razón Social: Transportes Ramírez SA de CV) y necesitamos rentar una pickup doble cabina por 2 meses, es urgente para la próxima semana.",
          telefono: "5551234567"
        }
      }
    },
    lead: {
      eventType: "lead_created",
      item: { itemId: String(3000 + Math.floor(Math.random() * 999)), itemName: "Carlos Méndez" },
      payload: {
        nombre: "Carlos Méndez",
        email: "carlos.mendez@construye-mx.com",
        telefono: "5559876543",
        razonSocial: "Construye MX SA de CV",
        rfc: "CMX950101AB9"
      }
    },
    call: (() => {
      // Cliente fijo (mismo teléfono) para poblar el historial por lead en el Item View.
      const TRANSCRIPTS = [
        "Vendedor: Hola Juan, gracias por tu tiempo. Cliente: Hola, si, andamos buscando 3 pickups para julio, pero la cotizacion que nos pasaron se ve un poco cara comparada con otras rentadoras. Vendedor: Entiendo, dejame revisar si podemos ofrecerte un descuento por volumen y te envio la cotizacion actualizada antes del viernes. Cliente: Perfecto, quedamos asi.",
        "Vendedor: Juan, te llamo para darte seguimiento. Cliente: Si, ya revise la cotizacion, me interesa muchisimo. Tenemos un problema urgente de unidades paradas que nos esta costando. Vendedor: Te muestro el comparativo de costo total: mantener flota propia inmoviliza ~30% mas de capital. Cliente: No lo habia visto asi. Vendedor: Agendemos con finanzas el jueves. Cliente: De acuerdo, adelante.",
        "Vendedor: Hola Juan. Cliente: Mira, lo estuve pensando y sigo dudando por el precio, ademas mi jefe no esta convencido. Vendedor: Entiendo. Cliente: No se si avanzar. Vendedor: Te marco la proxima semana. Cliente: Va."
      ];
      const transcript = TRANSCRIPTS[Math.floor(Math.random() * TRANSCRIPTS.length)];
      // Vendedores de ejemplo para poblar el desglose por vendedor del Coaching.
      const VENDEDORES = ["Nadia López", "Carlos Ruiz"];
      return {
        eventType: "call_recorded" as const,
        item: { itemId: String(4000 + Math.floor(Math.random() * 999999)), itemName: "Llamada - Juan Garcia" },
        payload: { transcript, telefono: "8112345678", vendedor: VENDEDORES[Math.floor(Math.random() * VENDEDORES.length)] }
      };
    })()
  };

  const event = scenarios[scenario];
  if (!event) {
    return res.status(400).json({ error: `Escenario no encontrado. Usa: ${Object.keys(scenarios).join(", ")}` });
  }

  try {
    const result = await handleOrchestratorEvent(event);
    res.json({ event, result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
