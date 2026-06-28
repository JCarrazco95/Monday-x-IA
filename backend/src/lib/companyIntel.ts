import { db } from "../db/index.js";
import type { CompanyResearch } from "../agents/types.js";

/**
 * Base de conocimiento de empresas: cachea y acumula la investigación que el
 * Lead Enrichment Agent hace de cada razón social. Esto es lo que permite que
 * el agente "se eduque": en vez de empezar de cero cada vez, reutiliza y
 * enriquece lo que ya aprendió de esa empresa (o de empresas con el mismo RFC).
 */

export interface CompanyIntelRecord {
  key: string;
  razonSocial: string | null;
  rfc: string | null;
  research: CompanyResearch;
  fuente: "web" | "modelo" | "demo";
  hits: number;
  firstSeen: string;
  updatedAt: string;
}

/** Normaliza la razón social para usarla como clave estable. */
export function intelKey(razonSocial?: string | null, rfc?: string | null): string | null {
  if (rfc && rfc.trim()) return `rfc:${rfc.trim().toUpperCase()}`;
  if (razonSocial && razonSocial.trim()) {
    const norm = razonSocial
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\b(s\.?a\.?\s*de\s*c\.?v\.?|s\.?\s*de\s*r\.?l\.?|sapi|sc|ac)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return norm ? `rs:${norm}` : null;
  }
  return null;
}

interface Row {
  key: string;
  razon_social: string | null;
  rfc: string | null;
  research: string;
  fuente: string;
  hits: number;
  first_seen: string;
  updated_at: string;
}

export async function getCompanyIntel(key: string): Promise<CompanyIntelRecord | null> {
  const row = await db.queryOne<Row>("SELECT * FROM company_intel WHERE key = ?", [key]);
  if (!row) return null;
  try {
    return {
      key: row.key,
      razonSocial: row.razon_social,
      rfc: row.rfc,
      research: JSON.parse(row.research) as CompanyResearch,
      fuente: (row.fuente as CompanyIntelRecord["fuente"]) ?? "demo",
      hits: row.hits,
      firstSeen: row.first_seen,
      updatedAt: row.updated_at
    };
  } catch {
    return null;
  }
}

/** Inserta o actualiza el conocimiento de una empresa y devuelve los hits acumulados. */
export async function saveCompanyIntel(opts: {
  key: string;
  razonSocial?: string | null;
  rfc?: string | null;
  research: CompanyResearch;
  fuente: "web" | "modelo" | "demo";
}): Promise<number> {
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ hits: number }>(
    "SELECT hits FROM company_intel WHERE key = ?",
    [opts.key]
  );

  if (existing) {
    await db.run(
      `UPDATE company_intel
       SET razon_social = COALESCE(?, razon_social),
           rfc = COALESCE(?, rfc),
           research = ?,
           fuente = ?,
           hits = hits + 1,
           updated_at = ?
       WHERE key = ?`,
      [
        opts.razonSocial ?? null,
        opts.rfc ?? null,
        JSON.stringify(opts.research),
        opts.fuente,
        now,
        opts.key
      ]
    );
    return existing.hits + 1;
  }

  await db.run(
    `INSERT INTO company_intel (key, razon_social, rfc, research, fuente, hits, first_seen, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      opts.key,
      opts.razonSocial ?? null,
      opts.rfc ?? null,
      JSON.stringify(opts.research),
      opts.fuente,
      now,
      now
    ]
  );
  return 1;
}
