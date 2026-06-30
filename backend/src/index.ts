import "dotenv/config";
import express from "express";
import cors from "cors";
import { agentsRouter } from "./routes/agents.js";
import { logsRouter } from "./routes/logs.js";
import { orchestratorRouter } from "./routes/orchestrator.js";
import { leadsRouter } from "./routes/leads.js";
import { intakeRouter } from "./routes/intake.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { callsRouter } from "./routes/calls.js";
import { nbaRouter } from "./routes/nba.js";
import { coachingRouter } from "./routes/coaching.js";
import { forecastRouter } from "./routes/forecast.js";
import { assistantRouter } from "./routes/assistant.js";
import { mondayRouter } from "./routes/monday.js";
import { scraperRouter } from "./routes/scraper.js";
import { isMockMode } from "./lib/claude.js";
import { PROVIDER, providerLabel } from "./lib/provider.js";
import { isMondayMockMode } from "./lib/monday.js";
import { initDb, dbKind, db } from "./db/index.js";
import { seed } from "./db/seed.js";
import { runNextBestActionAgent } from "./agents/nextBestActionAgent.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    claudeMode: isMockMode ? "mock" : "live",
    aiProvider: PROVIDER,
    mondayMode: isMondayMockMode ? "mock" : "live",
    db: dbKind(),
    timestamp: new Date().toISOString()
  });
});

app.use("/api/agents", agentsRouter);
app.use("/api/logs", logsRouter);
app.use("/api/orchestrator", orchestratorRouter);
app.use("/api/leads", intakeRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/calls", callsRouter);
app.use("/api/nba", nbaRouter);
app.use("/api/coaching", coachingRouter);
app.use("/api/forecast", forecastRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/monday", mondayRouter);
app.use("/api/scraper", scraperRouter);

async function start() {
  // Inicializa la BD (SQLite local o Postgres si hay DATABASE_URL) y siembra
  // los agentes ANTES de aceptar peticiones, para que nada toque la BD sin estar lista.
  await initDb();
  await seed();

  app.listen(PORT, () => {
    console.log(`\n🚀 MAXIRent backend escuchando en http://localhost:${PORT}`);
    console.log(`   IA:      ${providerLabel()}`);
    console.log(`   Monday:  ${isMondayMockMode ? "MOCK (sin MONDAY_API_TOKEN)" : "LIVE"}`);
    console.log(`   BD:      ${dbKind()}`);
    scheduleNextBestAction();
  });
}

// "Cron" interno opcional para el Next Best Action: si NBA_CRON_HOURS está
// definido, ejecuta el agente cada N horas y escribe alertas en Monday (si el
// agente está activo). Sin la variable, queda inactivo (se corre bajo demanda).
function scheduleNextBestAction() {
  const hours = Number(process.env.NBA_CRON_HOURS);
  if (!hours || hours <= 0) return;
  const intervalMs = hours * 3_600_000;
  const tick = async () => {
    try {
      const row = await db.queryOne<{ status: string }>(
        "SELECT status FROM agents WHERE id = 'next_best_action'"
      );
      if ((row?.status ?? "paused") !== "active") return;
      const report = await runNextBestActionAgent({ write: true });
      console.log(`   NBA cron: ${report.totalAcciones} acción(es), ${report.porPrioridad.alta} alta.`);
    } catch (err) {
      console.error("   NBA cron error:", err instanceof Error ? err.message : err);
    }
  };
  setInterval(tick, intervalMs).unref();
  console.log(`   NBA cron: cada ${hours}h\n`);
}

start().catch((err) => {
  console.error("❌ No se pudo iniciar el backend:", err);
  process.exit(1);
});
