import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireApiKey, warnIfAuthDisabled, authEnabled } from "./lib/security.js";
import { apiLimiter, aiLimiter, webhookLimiter } from "./lib/rateLimit.js";
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
import { adminRouter } from "./routes/admin.js";
import { isMockMode } from "./lib/claude.js";
import { PROVIDER, providerLabel } from "./lib/provider.js";
import { isMondayMockMode, isMondayReadOnly } from "./lib/monday.js";
import { initDb, dbKind, db } from "./db/index.js";
import { seed } from "./db/seed.js";
import { runNextBestActionAgent } from "./agents/nextBestActionAgent.js";
import { usageSummary } from "./lib/usage.js";
import { syncCallsBoard } from "./lib/aircallIngest.js";
import { callsBoardConfigured } from "./lib/monday.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Detrás de un proxy (Render/Nginx): confía en X-Forwarded-* para que el rate
// limit por IP y los logs vean la IP real del cliente, no la del proxy.
app.set("trust proxy", 1);

// Cabeceras de seguridad (CSP desactivada: el frontend se sirve aparte).
app.use(helmet({ contentSecurityPolicy: false }));

// CORS restringido: si CORS_ORIGINS está definido (lista separada por comas),
// solo esos orígenes; si no, se refleja el origen (dev/demo).
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors(
    CORS_ORIGINS.length
      ? { origin: CORS_ORIGINS, credentials: true }
      : { origin: true, credentials: true }
  )
);

app.use(express.json({ limit: "2mb" }));

// /health y los webhooks son públicos (los webhooks verifican su propia firma);
// el resto de la API queda detrás del rate limit general y de la API key.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    claudeMode: isMockMode ? "mock" : "live",
    aiProvider: PROVIDER,
    mondayMode: isMondayMockMode ? "mock" : isMondayReadOnly ? "live-readonly" : "live",
    db: dbKind(),
    auth: authEnabled ? "on" : "off",
    timestamp: new Date().toISOString()
  });
});

// Webhooks: verificación propia (firma JWT de Monday / token de Aircall) + su
// propio rate limit. Van ANTES del gate de API key (son server-to-server).
app.use("/api/webhooks", webhookLimiter, webhooksRouter);

// A partir de aquí, todo exige API key (si está configurada) y pasa por el
// rate limit general de la API.
app.use("/api", apiLimiter, requireApiKey);

// Telemetría de consumo de IA (tokens) — visibilidad de costo.
app.get("/api/usage", (_req, res) => res.json(usageSummary()));

app.use("/api/agents", agentsRouter);
app.use("/api/logs", logsRouter);
// Endpoints que gastan IA / escriben: rate limit estricto adicional.
app.use("/api/orchestrator", aiLimiter, orchestratorRouter);
app.use("/api/leads", aiLimiter, intakeRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/calls", aiLimiter, callsRouter);
app.use("/api/nba", aiLimiter, nbaRouter);
app.use("/api/coaching", coachingRouter);
app.use("/api/forecast", forecastRouter);
app.use("/api/assistant", aiLimiter, assistantRouter);
app.use("/api/monday", mondayRouter);
app.use("/api/scraper", aiLimiter, scraperRouter);
app.use("/api/admin", adminRouter);

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
    console.log(`   Auth:    ${authEnabled ? "ON (API key requerida)" : "OFF (abierta)"}`);
    warnIfAuthDisabled();
    scheduleNextBestAction();
    scheduleCallsSync();
  });
}

// "Cron" interno para sincronizar el tablero de llamadas de Aircall: si
// CALLS_SYNC_CRON_HOURS está definido (p. ej. 1 = cada hora, 0.5 = 30 min),
// corre syncCallsBoard() automáticamente. Respeta CALLS_SYNC_SINCE (solo lo
// nuevo) y CALLS_SYNC_MAX (tope por corrida). Idempotente: no re-analiza.
function scheduleCallsSync() {
  const hours = Number(process.env.CALLS_SYNC_CRON_HOURS);
  if (!hours || hours <= 0 || !callsBoardConfigured) return;
  const intervalMs = hours * 3_600_000;
  const tick = async () => {
    try {
      const r = await syncCallsBoard();
      if (r.analizadas > 0) console.log(`   Calls sync: ${r.analizadas} llamada(s) nueva(s) analizada(s).`);
    } catch (err) {
      console.error("   Calls sync error:", err instanceof Error ? err.message : err);
    }
  };
  setTimeout(tick, 30_000); // primera corrida ~30s tras arrancar
  setInterval(tick, intervalMs).unref();
  console.log(`   Calls sync cron: cada ${hours}h\n`);
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
