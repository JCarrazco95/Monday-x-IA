// ===========================================================================
//  Contrato común de la capa de datos.
//
//  El resto del backend NO sabe si detrás hay SQLite (dev local) o Postgres
//  (producción): siempre habla con esta interfaz asíncrona. Cambiar de motor
//  es cambiar de driver, nada más.
//
//  Convenciones para el SQL de la app (portable entre ambos motores):
//   - Placeholders posicionales con "?" (el driver de Postgres los traduce a $1, $2…).
//   - Timestamps y JSON se guardan como TEXT y se generan en JS (ISO string),
//     para que el comportamiento sea idéntico en los dos motores.
//   - Para recuperar el id recién insertado usa  INSERT … RETURNING id  con queryOne().
// ===========================================================================

export interface Driver {
  kind: "sqlite" | "postgres";
  /** Crea el esquema si no existe. Idempotente. */
  init(): Promise<void>;
  /** Devuelve todas las filas. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Devuelve la primera fila o undefined. */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Ejecuta INSERT/UPDATE/DELETE. lastInsertId solo aplica a SQLite o a INSERT … RETURNING id. */
  run(sql: string, params?: unknown[]): Promise<{ lastInsertId: number | null }>;
}
