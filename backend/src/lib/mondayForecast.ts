import { mondayRequest, isMondayMockMode } from "./monday.js";

// ===========================================================================
//  Lectura SOLO LECTURA del board "Oportunidades Maxirent" (y opcionalmente
//  "Objetivos de venta") para alimentar el forecast con datos reales.
//
//  Todo son queries GraphQL puras: este módulo NO contiene ninguna mutation,
//  no escribe columnas ni toca automatizaciones.
//
//  Los IDs de columna tienen defaults del board real de MAXIRent y se pueden
//  sobreescribir por entorno (FORECAST_COL_*) si el board cambia.
// ===========================================================================

const BOARD_OPORTUNIDADES = process.env.MONDAY_BOARD_ID_OPORTUNIDADES ?? "";
const BOARD_OBJETIVOS = process.env.MONDAY_BOARD_ID_OBJETIVOS ?? "";

const COL_ETAPA = process.env.FORECAST_COL_ETAPA ?? "deal_stage";
const COL_VALOR = process.env.FORECAST_COL_VALOR ?? "n_meros_mkmfsgxr"; // "Valor del acuerdo"
const COL_VALOR_ALT = process.env.FORECAST_COL_VALOR_ALT ?? "deal_value"; // "Valor de la cotizacion"
const COL_FECHA_CIERRE = process.env.FORECAST_COL_FECHA_CIERRE ?? "deal_expected_close_date";
const COL_FECHA_CIERRE_REAL = process.env.FORECAST_COL_FECHA_CIERRE_REAL ?? "deal_close_date";
const COL_MES_CIERRE = process.env.FORECAST_COL_MES_CIERRE ?? "color_mm12f2n8"; // status "Mes de cierre"
const COL_EJECUTIVO = process.env.FORECAST_COL_EJECUTIVO ?? "deal_owner";
const COL_EMPRESA = process.env.FORECAST_COL_EMPRESA ?? "text_mkvxs7sb"; // "Razón social"
const COL_MOTIVO_PERDIDA = process.env.FORECAST_COL_MOTIVO_PERDIDA ?? "men__desplegable_mkmfqf7c"; // "Motivo de no compra*"

export const forecastMondayEnabled = !isMondayMockMode && Boolean(BOARD_OPORTUNIDADES);

export type EtapaDeal =
  | "Cotización enviada"
  | "Requiere seguimiento"
  | "Negociando"
  | "Documentación"
  | "Ganado"
  | "Perdido"
  | "Sin etapa";

export interface DealRow {
  itemId: string;
  itemName: string;
  empresa: string | null;
  ejecutivo: string | null;
  grupo: string;
  etapa: EtapaDeal;
  /** MXN. null si el deal no tiene monto capturado en ninguna de las dos columnas. */
  valor: number | null;
  fechaCierreEstimada: string | null; // YYYY-MM-DD
  fechaCierreReal: string | null;     // YYYY-MM-DD
  mesCierreLabel: string | null;      // etiqueta del status "Mes de cierre" (p. ej. "JULIO 2026")
  /** "Motivo de no compra*" (dropdown) — solo tiene sentido en deals Perdido. */
  motivoPerdida: string | null;
  /** Link directo al item en Monday (para abrirlo desde el panel). */
  mondayUrl: string | null;
  /** Archivos del item (cotizaciones): el primero con extensión .pdf primero. */
  archivos: { nombre: string; url: string; extension: string | null }[];
}

interface RawCV {
  id: string;
  text: string | null;
}
interface RawAsset {
  name?: string;
  public_url?: string | null;
  file_extension?: string | null;
}
interface RawItem {
  id: string;
  name: string;
  group?: { title?: string };
  column_values?: RawCV[];
  assets?: RawAsset[];
}

// ── Slug de la cuenta (para construir URLs de items) ─────────────────────────
// https://<slug>.monday.com/boards/<boardId>/pulses/<itemId>
// Se consulta una vez y se cachea; MONDAY_ACCOUNT_SLUG lo puede fijar por env.
let accountSlug: string | null | undefined; // undefined = aún no consultado

async function getAccountSlug(): Promise<string | null> {
  if (accountSlug !== undefined) return accountSlug;
  const fromEnv = process.env.MONDAY_ACCOUNT_SLUG?.trim();
  if (fromEnv) {
    accountSlug = fromEnv;
    return accountSlug;
  }
  try {
    const data: { account?: { slug?: string } } = await mondayRequest(`query { account { slug } }`);
    accountSlug = data?.account?.slug ?? null;
  } catch {
    accountSlug = null;
  }
  return accountSlug;
}

export function itemUrl(slug: string | null, boardId: string, itemId: string): string | null {
  return slug ? `https://${slug}.monday.com/boards/${boardId}/pulses/${itemId}` : null;
}

function parseMonto(text: string | null): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizarEtapa(texto: string | null, grupo: string): EtapaDeal {
  // El grupo manda en los cierres: hay items en "Perdidos" con la etapa
  // desactualizada (p. ej. aún "Cotización enviada").
  if (/perdido/i.test(grupo)) return "Perdido";
  if (/ganado/i.test(grupo)) return "Ganado";
  const t = (texto ?? "").trim();
  const CONOCIDAS: EtapaDeal[] = [
    "Cotización enviada", "Requiere seguimiento", "Negociando", "Documentación", "Ganado", "Perdido"
  ];
  return (CONOCIDAS.find((e) => e.toLowerCase() === t.toLowerCase()) ?? (t ? "Sin etapa" : "Sin etapa"));
}

/** Lee TODAS las oportunidades del board (paginado). Lanza si Monday falla. */
export async function getDealsBoard(): Promise<DealRow[]> {
  if (!forecastMondayEnabled) return [];
  const colIds = [COL_ETAPA, COL_VALOR, COL_VALOR_ALT, COL_FECHA_CIERRE, COL_FECHA_CIERRE_REAL, COL_MES_CIERRE, COL_EJECUTIVO, COL_EMPRESA, COL_MOTIVO_PERDIDA];
  const query = `
    query ($ids: [ID!], $cols: [String!], $cursor: String) {
      boards (ids: $ids) {
        items_page (limit: 200, cursor: $cursor) {
          cursor
          items {
            id
            name
            group { title }
            column_values (ids: $cols) { id text }
            assets { name public_url file_extension }
          }
        }
      }
    }
  `;
  const slug = await getAccountSlug();
  const out: DealRow[] = [];
  let cursor: string | null = null;
  do {
    const data: {
      boards?: Array<{ items_page?: { cursor: string | null; items?: RawItem[] } }>;
    } = await mondayRequest(query, { ids: [BOARD_OPORTUNIDADES], cols: colIds, cursor });
    const page = data?.boards?.[0]?.items_page;
    if (!page) break;
    cursor = page.cursor;
    for (const it of page.items ?? []) {
      const cv = new Map((it.column_values ?? []).map((c) => [c.id, c.text ?? null]));
      // Archivos del item (cotizaciones). PDFs primero; public_url es un enlace
      // firmado de Monday (caduca en ~1h, pero se regenera en cada carga).
      const archivos = (it.assets ?? [])
        .filter((a): a is RawAsset & { name: string; public_url: string } => Boolean(a.name && a.public_url))
        .map((a) => ({ nombre: a.name, url: a.public_url, extension: a.file_extension?.toLowerCase() ?? null }))
        .sort((a, b) => Number(b.extension === ".pdf" || b.extension === "pdf") - Number(a.extension === ".pdf" || a.extension === "pdf"));
      out.push({
        itemId: it.id,
        itemName: it.name,
        empresa: cv.get(COL_EMPRESA) || null,
        ejecutivo: cv.get(COL_EJECUTIVO) || null,
        grupo: it.group?.title ?? "",
        etapa: normalizarEtapa(cv.get(COL_ETAPA) ?? null, it.group?.title ?? ""),
        valor: parseMonto(cv.get(COL_VALOR) ?? null) ?? parseMonto(cv.get(COL_VALOR_ALT) ?? null),
        fechaCierreEstimada: cv.get(COL_FECHA_CIERRE) || null,
        fechaCierreReal: cv.get(COL_FECHA_CIERRE_REAL) || null,
        mesCierreLabel: cv.get(COL_MES_CIERRE) || null,
        motivoPerdida: cv.get(COL_MOTIVO_PERDIDA) || null,
        mondayUrl: itemUrl(slug, BOARD_OPORTUNIDADES, it.id),
        archivos
      });
    }
  } while (cursor);
  return out;
}

export interface ObjetivoMes {
  mesKey: string;   // YYYY-MM
  objetivo: number; // suma de los objetivos de todos los reps para ese mes
}

const MES_TITULO: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11
};

/**
 * Lee los objetivos mensuales del board "Objetivos de venta" (mejor esfuerzo).
 * Los objetivos son columnas numbers cuyo TÍTULO es "Ene.: objetivo", etc.
 * (los IDs de columna del board están desalineados con el mes, por eso se
 * mapea por título). Si el board no es visible para el token (items ocultos
 * por permisos), devuelve { disponible:false } sin romper nada.
 */
export async function getObjetivosMensuales(anio: number): Promise<{
  disponible: boolean;
  motivo?: string;
  porMes: ObjetivoMes[];
}> {
  if (!isMondayMockMode && BOARD_OBJETIVOS) {
    try {
      const data: {
        boards?: Array<{
          columns?: Array<{ id: string; title: string; type: string }>;
          items_page?: { items?: Array<{ column_values?: RawCV[] }> };
        }>;
      } = await mondayRequest(
        `query ($ids: [ID!]) {
          boards (ids: $ids) {
            columns { id title type }
            items_page (limit: 25) {
              items { column_values { id text } }
            }
          }
        }`,
        { ids: [BOARD_OBJETIVOS] }
      );
      const board = data?.boards?.[0];
      const items = board?.items_page?.items ?? [];
      if (!items.length) {
        return {
          disponible: false,
          motivo: "El board de Objetivos no devuelve items (revisar permisos de visualización del board para este token).",
          porMes: []
        };
      }
      // Columnas "Xxx.: objetivo" → mes.
      const colMes = new Map<string, number>();
      for (const c of board?.columns ?? []) {
        if (c.type !== "numbers") continue;
        const m = c.title.toLowerCase().match(/^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\.?\s*:\s*objetivo/);
        if (m) colMes.set(c.id, MES_TITULO[m[1]]);
      }
      const totales = new Map<number, number>();
      for (const it of items) {
        for (const cv of it.column_values ?? []) {
          const mes = colMes.get(cv.id);
          if (mes === undefined) continue;
          const n = parseMonto(cv.text);
          if (n != null) totales.set(mes, (totales.get(mes) ?? 0) + n);
        }
      }
      const porMes = [...totales.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([mes, objetivo]) => ({ mesKey: `${anio}-${String(mes + 1).padStart(2, "0")}`, objetivo }));
      return { disponible: porMes.length > 0, motivo: porMes.length ? undefined : "Sin columnas de objetivo legibles.", porMes };
    } catch (err) {
      return {
        disponible: false,
        motivo: `Error leyendo Objetivos: ${err instanceof Error ? err.message : String(err)}`,
        porMes: []
      };
    }
  }
  return { disponible: false, motivo: "Sin token de Monday o sin MONDAY_BOARD_ID_OBJETIVOS.", porMes: [] };
}
