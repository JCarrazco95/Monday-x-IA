// ===========================================================================
//  Esquema lógico, en dos dialectos (SQLite y Postgres).
//
//  Mismas tablas y columnas en ambos motores. Diferencias mínimas:
//   - id autoincremental: AUTOINCREMENT (SQLite) vs SERIAL (Postgres).
//   - Todo lo demás es TEXT/INTEGER, idéntico, para que las filas se lean igual.
//
//  Los timestamps (timestamp, created_at, updated_at, first_seen) NO usan
//  DEFAULT del motor: se pasan siempre desde la app como ISO string, así el
//  formato es idéntico en los dos motores.
// ===========================================================================

function ddl(autoId: string): string {
  return `
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  description   TEXT NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'paused',
  model         TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
  tools         TEXT NOT NULL DEFAULT '[]',
  version       TEXT NOT NULL DEFAULT '0.1.0',
  last_run_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id          ${autoId},
  timestamp   TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info',
  title       TEXT NOT NULL,
  detail      TEXT,
  reference   TEXT,
  payload     TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS company_intel (
  id           ${autoId},
  key          TEXT NOT NULL UNIQUE,
  razon_social TEXT,
  rfc          TEXT,
  research     TEXT NOT NULL,
  fuente       TEXT NOT NULL DEFAULT 'demo',
  hits         INTEGER NOT NULL DEFAULT 1,
  first_seen   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_agent ON logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_reference ON logs(reference);
CREATE INDEX IF NOT EXISTS idx_company_intel_key ON company_intel(key);
`;
}

export const SQLITE_DDL = ddl("INTEGER PRIMARY KEY AUTOINCREMENT");
export const POSTGRES_DDL = ddl("SERIAL PRIMARY KEY");
