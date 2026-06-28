import type { Driver } from "./driver.js";

// ===========================================================================
//  Punto de acceso a la base de datos.
//
//  Selecciona el motor por entorno:
//   - DATABASE_URL presente  -> Postgres (producción, durable).
//   - si no                  -> SQLite local (DATABASE_PATH o ./data/maxirent.db).
//
//  TODOS los consumidores importan { db } y usan db.query / db.queryOne / db.run
//  (asíncronos). Antes de servir peticiones hay que llamar a initDb() una vez.
// ===========================================================================

let driver: Driver | null = null;

export function dbKind(): "sqlite" | "postgres" | "uninitialized" {
  return driver?.kind ?? "uninitialized";
}

export async function initDb(): Promise<void> {
  if (driver) return;
  if (process.env.DATABASE_URL) {
    const { createPostgresDriver } = await import("./postgresDriver.js");
    driver = await createPostgresDriver(process.env.DATABASE_URL);
  } else {
    const { createSqliteDriver } = await import("./sqliteDriver.js");
    driver = createSqliteDriver(process.env.DATABASE_PATH);
  }
  await driver.init();
}

function ready(): Driver {
  if (!driver) {
    throw new Error("Base de datos no inicializada. Llama a initDb() durante el arranque.");
  }
  return driver;
}

export const db = {
  query: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    ready().query<T>(sql, params),
  queryOne: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    ready().queryOne<T>(sql, params),
  run: (sql: string, params: unknown[] = []) => ready().run(sql, params)
};
