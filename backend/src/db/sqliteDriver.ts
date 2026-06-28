import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Driver } from "./driver.js";
import { SQLITE_DDL } from "./schema.js";

// Driver de SQLite (node:sqlite) para desarrollo local: cero infraestructura.
// node:sqlite es síncrono; lo envolvemos en promesas para cumplir el contrato.
export function createSqliteDriver(dbPathEnv?: string): Driver {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = dbPathEnv ?? path.join(__dirname, "../../data/maxirent.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  return {
    kind: "sqlite",
    async init() {
      sqlite.exec(SQLITE_DDL);
    },
    async query<T>(sql: string, params: unknown[] = []) {
      return sqlite.prepare(sql).all(...(params as never[])) as T[];
    },
    async queryOne<T>(sql: string, params: unknown[] = []) {
      return sqlite.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      const r = sqlite.prepare(sql).run(...(params as never[]));
      return { lastInsertId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null };
    }
  };
}
