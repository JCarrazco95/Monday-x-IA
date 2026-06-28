import type { Driver } from "./driver.js";
import { POSTGRES_DDL } from "./schema.js";

// Convierte placeholders "?" (estilo SQLite) a "$1, $2…" (estilo Postgres).
// Nuestro SQL nunca contiene "?" literales, así que el reemplazo es seguro.
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Driver de Postgres para producción (Render/Neon/Supabase): durable, con
// respaldos. Se carga de forma perezosa (`import("pg")`) para que el entorno de
// desarrollo con SQLite no requiera tener instalado `pg`.
export async function createPostgresDriver(connectionString: string): Promise<Driver> {
  const pg = await import("pg");
  const Pool = (pg as unknown as { default?: { Pool: typeof import("pg").Pool }; Pool: typeof import("pg").Pool })
    .default?.Pool ?? pg.Pool;

  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const pool = new Pool({
    connectionString,
    // Los Postgres gestionados suelen requerir SSL con cadena no verificable.
    ssl: isLocal ? undefined : { rejectUnauthorized: false }
  });

  return {
    kind: "postgres",
    async init() {
      await pool.query(POSTGRES_DDL);
    },
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(toPg(sql), params as unknown[]);
      return r.rows as T[];
    },
    async queryOne<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(toPg(sql), params as unknown[]);
      return r.rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      const r = await pool.query(toPg(sql), params as unknown[]);
      const row = r.rows?.[0] as Record<string, unknown> | undefined;
      const id = row && "id" in row ? Number(row.id) : null;
      return { lastInsertId: Number.isNaN(id as number) ? null : id };
    }
  };
}
