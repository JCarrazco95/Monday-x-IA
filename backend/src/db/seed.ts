import { db, initDb } from "./index.js";

const agents = [
  {
    id: "orchestrator",
    name: "Orchestrator Agent",
    role: "Orquestador principal",
    description:
      "Recibe los eventos (webhooks de Monday y Make), determina qué agente especializado debe procesar cada caso, consolida resultados y dispara al Monday Writer Agent. Actúa como el punto único de entrada de todo el sistema.",
    priority: 0,
    status: "active",
    model: "claude-sonnet-4-5",
    tools: JSON.stringify([
      "route_event",
      "get_monday_item",
      "dispatch_agent",
      "log_activity"
    ]),
    version: "0.1.0"
  },
  {
    id: "form_analysis",
    name: "Form Analysis Agent",
    role: "Prioridad 1 · Análisis de formularios",
    description:
      "Analiza las respuestas de formularios de cotización/contacto. Identifica vehículo de interés, duración de renta, tipo de cliente (personal/empresarial), nivel de urgencia y mapea los campos a las columnas correspondientes en Monday. Sugiere una plantilla de respuesta.",
    priority: 1,
    status: "active",
    model: "claude-sonnet-4-5",
    tools: JSON.stringify([
      "map_to_monday_columns",
      "classify_lead_intent",
      "suggest_reply_template"
    ]),
    version: "0.1.0"
  },
  {
    id: "lead_enrichment",
    name: "Lead Enrichment Agent",
    role: "Prioridad 2 · Calificación y enriquecimiento de leads",
    description:
      "Al crearse un lead, busca duplicados en Monday por email/RFC, enriquece datos de la empresa (sector, tamaño), calcula un score de viabilidad 0-100 y sugiere la siguiente acción comercial.",
    priority: 2,
    status: "active",
    model: "claude-sonnet-4-5",
    tools: JSON.stringify([
      "search_monday_duplicates",
      "enrich_company",
      "score_lead"
    ]),
    version: "0.1.0"
  },
  {
    id: "call_intelligence",
    name: "Call Intelligence Agent",
    role: "Prioridad 3 · Análisis de llamadas",
    description:
      "Transcribe (Deepgram/Whisper) y analiza llamadas de ventas con dos modelos: Sandler (resumen, vehículos, objeciones, compromisos, sentimiento, probabilidad de cierre) y Challenger Sale (score, perfil del vendedor, insight/reframe/siguiente paso).",
    priority: 3,
    status: "active",
    model: "claude-opus-4-5",
    tools: JSON.stringify([
      "transcribe_audio",
      "extract_commitments",
      "analyze_sentiment",
      "create_monday_tasks"
    ]),
    version: "0.1.0"
  },
  {
    id: "next_best_action",
    name: "Next Best Action Agent",
    role: "Prioridad 4 · Seguimiento y alertas",
    description:
      "Supervisor de seguimiento que nunca olvida: recorre la bitácora y levanta alertas accionables (compromisos sin seguimiento o vencidos, leads calientes/tibios enfriándose, llamadas con banderas rojas). Escribe las alertas de alta prioridad de vuelta a Monday (columna 'requiere_atencion' + comentario) para que las automatizaciones nativas notifiquen al vendedor. Corre a diario (cron) o bajo demanda.",
    priority: 4,
    status: "active",
    model: "deterministic",
    tools: JSON.stringify(["scan_activity_log", "detect_followups", "write_monday_alert"]),
    version: "0.1.0"
  },
  {
    id: "monday_writer",
    name: "Monday Writer Agent",
    role: "Soporte · Escritura en Monday",
    description:
      "Recibe los resultados estructurados de los demás agentes y los escribe en las columnas, subitems y comentarios correspondientes del board de Monday vía API GraphQL.",
    priority: 99,
    status: "active",
    model: "claude-sonnet-4-5",
    tools: JSON.stringify([
      "update_monday_column",
      "create_monday_subitem",
      "post_monday_comment"
    ]),
    version: "0.1.0"
  }
];

async function insertAgent(a: (typeof agents)[number], now: string) {
  await db.run(
    `INSERT INTO agents (id, name, role, description, priority, status, model, tools, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       role=excluded.role,
       description=excluded.description,
       priority=excluded.priority,
       model=excluded.model,
       tools=excluded.tools,
       version=excluded.version,
       updated_at=excluded.updated_at`,
    [a.id, a.name, a.role, a.description, a.priority, a.status, a.model, a.tools, a.version, now, now]
  );
}

interface SampleLog {
  timestamp: string;
  agent_id: string;
  type: string;
  title: string;
  detail: string | null;
  reference: string | null;
  payload: string | null;
  duration_ms: number | null;
}

async function insertLog(l: SampleLog) {
  await db.run(
    `INSERT INTO logs (timestamp, agent_id, type, title, detail, reference, payload, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [l.timestamp, l.agent_id, l.type, l.title, l.detail, l.reference, l.payload, l.duration_ms]
  );
}

export async function seed() {
  const now = new Date().toISOString();
  for (const agent of agents) await insertAgent(agent, now);

  // Solo sembrar logs de ejemplo si la tabla está vacía
  const countRow = await db.queryOne<{ c: number }>("SELECT CAST(COUNT(*) AS INTEGER) as c FROM logs");
  const count = countRow?.c ?? 0;
  if (count === 0) {
    const now = Date.now();
    const minutesAgo = (m: number) => new Date(now - m * 60000).toISOString();

    const sampleLogs = [
      {
        timestamp: minutesAgo(120),
        agent_id: "orchestrator",
        type: "info",
        title: "Sistema iniciado",
        detail: "Orquestador conectado a Monday y a la cola de eventos.",
        reference: null,
        payload: null,
        duration_ms: null
      },
      {
        timestamp: minutesAgo(95),
        agent_id: "form_analysis",
        type: "success",
        title: "Formulario analizado",
        detail:
          "Cliente solicita pickup doble cabina por 3 meses, uso empresarial. Urgencia: alta. Campos mapeados a columnas de Monday.",
        reference: "#1042 · Juan García / ACME SA",
        payload: JSON.stringify({
          vehiculo: "Pickup doble cabina",
          duracion: "3 meses",
          tipo_cliente: "empresarial",
          urgencia: "alta"
        }),
        duration_ms: 2150
      },
      {
        timestamp: minutesAgo(90),
        agent_id: "lead_enrichment",
        type: "success",
        title: "Lead calificado",
        detail: "Score 78/100. Empresa verificada (RFC válido). Sin duplicados encontrados.",
        reference: "#1042 · Juan García / ACME SA",
        payload: JSON.stringify({ score: 78, riesgo: "bajo", duplicado: false }),
        duration_ms: 3400
      },
      {
        timestamp: minutesAgo(60),
        agent_id: "monday_writer",
        type: "info",
        title: "Columnas actualizadas en Monday",
        detail: "Score, perfil de empresa y acción recomendada escritos en el item.",
        reference: "#1042 · Juan García / ACME SA",
        payload: null,
        duration_ms: 540
      },
      {
        timestamp: minutesAgo(30),
        agent_id: "form_analysis",
        type: "warning",
        title: "Vehículo no disponible en flota",
        detail:
          "El cliente solicitó un SUV de lujo que no está en el catálogo actual. Se sugiere ofrecer alternativa similar.",
        reference: "#1051 · María López",
        payload: null,
        duration_ms: 1800
      },
      {
        timestamp: minutesAgo(10),
        agent_id: "call_intelligence",
        type: "error",
        title: "Error de transcripción",
        detail: "No se pudo acceder a la URL de la grabación (404). Se reintentará en 15 minutos.",
        reference: "#1038 · Carlos Méndez",
        payload: null,
        duration_ms: 800
      }
    ];

    for (const log of sampleLogs) await insertLog(log);
  }
}

// Permite ejecutar el seed directamente:  npm run seed  (tsx src/db/seed.ts).
// Cuando se importa desde index.ts NO se auto-ejecuta (lo llama el bootstrap).
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  await initDb();
  await seed();
  console.log("✅ Seed completado: agentes y bitacora de ejemplo listos.");
  process.exit(0);
}
