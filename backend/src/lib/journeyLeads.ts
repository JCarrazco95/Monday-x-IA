import { mondayRequest, isMondayMockMode } from "./monday.js";

// ===========================================================================
//  Lectura SOLO LECTURA de dos boards nuevos para las pestañas "Journey de
//  Leads" y "Leads" del Pipeline. Mismo patrón que mondayForecast.ts: cero
//  mutations, paginado, y `display_value` para columnas "mirror" (su valor
//  real no viene en `text` aunque el tablero sí lo muestre).
// ===========================================================================

const BOARD_TIME_STAP = process.env.MONDAY_BOARD_ID_TIME_STAP ?? "18423822387";
// OJO: MONDAY_BOARD_ID_LEADS ya existe y apunta al board de PRUEBAS/escritura
// (18419649847) — este es un board DISTINTO, el real de producción, solo
// lectura, nunca se escribe aquí.
const BOARD_LEADS_MAXIRENT = process.env.MONDAY_BOARD_ID_LEADS_MAXIRENT ?? "8311006929";

const GRUPOS_JOURNEY = ["group_mm5nc0b", "group_mm5npb2y", "group_mm5nj1xc"];

const COL_TS_ORIGEN = "lookup_mm5n41b1"; // "Origen" (mirror)
const COL_TS_EJECUTIVO = "lookup_mm5nnq7s"; // "Ejecutivo" (mirror)
const COL_TS_ESTADO = "lookup_mm5njsg2"; // "Estado Lead" (mirror)
const COL_TS_FECHA_CREACION = "date_mm5nd7xj"; // "Fecha Creación" (date)
const COL_TS_CAMBIO_INTENTANDO = "date4"; // "Cambio a Intentando contactar"
const COL_TS_CAMBIO_CONTACTADO = "date_mm5mfe45"; // "Cambio a Contactado"
const COL_TS_CAMBIO_COTIZAR = "date_mm5mty3j"; // "Cambio a cotizar"
const COL_TS_CAMBIO_NO_CONTACTADO = "date_mm5m5qnh"; // "Cambio a No Contactado"
const COL_TS_CAMBIO_NO_CALIFICA = "date_mm5mjqft"; // "Cambio a No califica"
const COL_TS_LLAMADAS = "text_mm5mv0ph"; // "Llamadas"
const COL_TS_MINUTOS_ATENCION = "text_mm5me0vg"; // "Minutos de atención"
const COL_TS_SEMAFORO = "text_mm5mhv55"; // "Semaforo"
const COL_TS_REVISADO = "color_mm5nvz93"; // "Revisado" (status)

export interface JourneyLeadRow {
  itemId: string;
  itemName: string;
  grupo: string;
  origen: string | null;
  ejecutivo: string | null;
  estadoLead: string | null;
  fechaCreacion: string | null;
  cambioIntentando: string | null;
  cambioContactado: string | null;
  cambioCotizar: string | null;
  cambioNoContactado: string | null;
  cambioNoCalifica: string | null;
  llamadas: string | null;
  minutosAtencion: string | null;
  semaforo: string | null;
  revisado: string | null;
}

interface RawColumnValue {
  id: string;
  text: string | null;
  display_value?: string | null;
}
function valorDe(cv: Map<string, RawColumnValue>, colId: string): string | null {
  const c = cv.get(colId);
  if (!c) return null;
  return (c.display_value || c.text) || null;
}

/**
 * Lee los leads de los 3 grupos de seguimiento del board "Time stamp"
 * (Calificados / No Califica / No contactado), filtrados a Origen = "Outbound"
 * o vacío (según lo pedido: excluir cualquier otra label de origen).
 */
export async function getJourneyLeads(): Promise<JourneyLeadRow[]> {
  if (isMondayMockMode || !BOARD_TIME_STAP) return [];
  const colIds = [
    COL_TS_ORIGEN, COL_TS_EJECUTIVO, COL_TS_ESTADO, COL_TS_FECHA_CREACION,
    COL_TS_CAMBIO_INTENTANDO, COL_TS_CAMBIO_CONTACTADO, COL_TS_CAMBIO_COTIZAR,
    COL_TS_CAMBIO_NO_CONTACTADO, COL_TS_CAMBIO_NO_CALIFICA,
    COL_TS_LLAMADAS, COL_TS_MINUTOS_ATENCION, COL_TS_SEMAFORO, COL_TS_REVISADO
  ];
  const query = `
    query ($boardId: [ID!], $groupIds: [String!], $cols: [String!]) {
      boards (ids: $boardId) {
        groups (ids: $groupIds) {
          id
          title
          items_page (limit: 200) {
            items {
              id
              name
              column_values (ids: $cols) { id text ... on MirrorValue { display_value } }
            }
          }
        }
      }
    }
  `;
  type Raw = {
    boards?: Array<{
      groups?: Array<{
        id: string;
        title: string;
        items_page?: { items?: Array<{ id: string; name: string; column_values?: RawColumnValue[] }> };
      }>;
    }>;
  };
  const data: Raw = await mondayRequest(query, { boardId: [BOARD_TIME_STAP], groupIds: GRUPOS_JOURNEY, cols: colIds });
  const out: JourneyLeadRow[] = [];
  for (const g of data?.boards?.[0]?.groups ?? []) {
    for (const it of g.items_page?.items ?? []) {
      const cv = new Map((it.column_values ?? []).map((c) => [c.id, c] as const));
      const origen = valorDe(cv, COL_TS_ORIGEN);
      // Filtro pedido: solo "Outbound" o vacío/sin label — se excluye cualquier
      // otra label (p. ej. si algún día aparece "Inbound").
      if (origen && origen.toLowerCase() !== "outbound") continue;
      out.push({
        itemId: it.id,
        itemName: it.name,
        grupo: g.title,
        origen,
        ejecutivo: valorDe(cv, COL_TS_EJECUTIVO),
        estadoLead: valorDe(cv, COL_TS_ESTADO),
        fechaCreacion: valorDe(cv, COL_TS_FECHA_CREACION),
        cambioIntentando: valorDe(cv, COL_TS_CAMBIO_INTENTANDO),
        cambioContactado: valorDe(cv, COL_TS_CAMBIO_CONTACTADO),
        cambioCotizar: valorDe(cv, COL_TS_CAMBIO_COTIZAR),
        cambioNoContactado: valorDe(cv, COL_TS_CAMBIO_NO_CONTACTADO),
        cambioNoCalifica: valorDe(cv, COL_TS_CAMBIO_NO_CALIFICA),
        llamadas: valorDe(cv, COL_TS_LLAMADAS),
        minutosAtencion: valorDe(cv, COL_TS_MINUTOS_ATENCION),
        semaforo: valorDe(cv, COL_TS_SEMAFORO),
        revisado: valorDe(cv, COL_TS_REVISADO)
      });
    }
  }
  return out;
}

// ── Board "Leads Maxirent" (producción, solo lectura, TODOS los grupos) ────

const COL_L_EJECUTIVO = "multiple_person_mkp6esfg"; // "Ejecutivo" (people)
const COL_L_ESTADO = "lead_status"; // "Estado Lead"
const COL_L_EMPRESA = "lead_company"; // "Razón Social"
const COL_L_TELEFONO = "lead_phone";
const COL_L_EMAIL = "lead_email";
const COL_L_ORIGEN = "dropdown_mkp6ea3p"; // "Origen"
const COL_L_IN_OUT = "color_mm2y50be"; // "IN/OUT"
const COL_L_COMO_ENTERO = "men__desplegable_mkmfpwb2"; // "¿Cómo se enteró de nosotros?"
const COL_L_MOTIVO_NO_COMPRA = "dropdown_mktqe4zj"; // "Motivo de no compra*"
const COL_L_CIUDAD_OPERACION = "texto_mkmf3q5c"; // "Ciudad de Operación"
const COL_L_TIPO_PROYECTO = "text_mktbdt8n"; // "Tipo de proyecto"
const COL_L_FECHA_CREACION = "date_mktj75z"; // "Fecha de creación"
const COL_L_ULTIMA_ACTUALIZACION = "date"; // "Última actualización"

export interface LeadBoardRow {
  itemId: string;
  itemName: string;
  grupo: string;
  ejecutivo: string | null;
  estadoLead: string | null;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
  origen: string | null;
  inOut: string | null;
  comoEntero: string | null;
  motivoNoCompra: string | null;
  ciudadOperacion: string | null;
  tipoProyecto: string | null;
  fechaCreacion: string | null;
  ultimaActualizacion: string | null;
}

/** Lee TODOS los leads (todos los grupos) del board real "Leads Maxirent". */
export async function getLeadsMaxirentBoard(): Promise<LeadBoardRow[]> {
  if (isMondayMockMode || !BOARD_LEADS_MAXIRENT) return [];
  const colIds = [
    COL_L_EJECUTIVO, COL_L_ESTADO, COL_L_EMPRESA, COL_L_TELEFONO, COL_L_EMAIL,
    COL_L_ORIGEN, COL_L_IN_OUT, COL_L_COMO_ENTERO, COL_L_MOTIVO_NO_COMPRA,
    COL_L_CIUDAD_OPERACION, COL_L_TIPO_PROYECTO, COL_L_FECHA_CREACION, COL_L_ULTIMA_ACTUALIZACION
  ];
  const query = `
    query ($ids: [ID!], $cols: [String!], $cursor: String) {
      boards (ids: $ids) {
        items_page (limit: 200, cursor: $cursor) {
          cursor
          items {
            id
            name
            group { title }
            column_values (ids: $cols) { id text ... on MirrorValue { display_value } }
          }
        }
      }
    }
  `;
  type Raw = {
    boards?: Array<{
      items_page?: {
        cursor: string | null;
        items?: Array<{ id: string; name: string; group?: { title?: string }; column_values?: RawColumnValue[] }>;
      };
    }>;
  };
  const out: LeadBoardRow[] = [];
  let cursor: string | null = null;
  do {
    const data: Raw = await mondayRequest(query, { ids: [BOARD_LEADS_MAXIRENT], cols: colIds, cursor });
    const page = data?.boards?.[0]?.items_page;
    if (!page) break;
    cursor = page.cursor;
    for (const it of page.items ?? []) {
      const cv = new Map((it.column_values ?? []).map((c) => [c.id, c] as const));
      out.push({
        itemId: it.id,
        itemName: it.name,
        grupo: it.group?.title ?? "Sin grupo",
        ejecutivo: valorDe(cv, COL_L_EJECUTIVO),
        estadoLead: valorDe(cv, COL_L_ESTADO),
        empresa: valorDe(cv, COL_L_EMPRESA),
        telefono: valorDe(cv, COL_L_TELEFONO),
        email: valorDe(cv, COL_L_EMAIL),
        origen: valorDe(cv, COL_L_ORIGEN),
        inOut: valorDe(cv, COL_L_IN_OUT),
        comoEntero: valorDe(cv, COL_L_COMO_ENTERO),
        motivoNoCompra: valorDe(cv, COL_L_MOTIVO_NO_COMPRA),
        ciudadOperacion: valorDe(cv, COL_L_CIUDAD_OPERACION),
        tipoProyecto: valorDe(cv, COL_L_TIPO_PROYECTO),
        fechaCreacion: valorDe(cv, COL_L_FECHA_CREACION),
        ultimaActualizacion: valorDe(cv, COL_L_ULTIMA_ACTUALIZACION)
      });
    }
  } while (cursor);
  return out;
}

// ===========================================================================
//  Cronograma de actividades (tipo + cantidad por actividad) por lead.
//
//  El widget "Cronograma de actividades" (custom_mktz7d26) es tipo
//  "unsupported" en la API — nunca trae datos aunque el tablero lo muestre.
//  Su fuente real son DOS lugares distintos:
//   1. Llamadas/reuniones/WhatsApp: board separado "Actividades de ventas"
//      (8311006639), enlazado desde cada lead vía la columna oculta
//      `board_relation_mm2w17ac`. Columnas reales de ese board:
//      activity_type/activity_owner/activity_start_time/long_text.
//   2. Correos: NO están en el board de actividades (confirmado con el
//      admin — ese board solo registra llamadas/mensajes). Sí aparecen como
//      updates() nativos del lead, con un patrón fijo y reconocible:
//      el cuerpo empieza con "Outgoing Email" (o "Incoming Email") y
//      `creator` viene null (lo genera la integración de correo de Monday,
//      no una persona). Cualquier otro update es un resumen/transcripción
//      de llamada (ya cubierto por el board de actividades) y se ignora
//      aquí para no duplicar conteos.
// ===========================================================================

const COL_LEAD_ACTIVIDADES_REL = "board_relation_mm2w17ac"; // "Actividades de ventas" (en Leads Maxirent)
const COL_TS_LEAD_REL = "board_relation_mm5nkh1c"; // "Leads Maxirent" (en Time stamp)

const COL_ACT_TIPO = "activity_type";
const COL_ACT_RESP = "activity_owner";
const COL_ACT_INICIO = "activity_start_time";
const COL_ACT_DESC = "long_text";

export interface CronogramaEntry {
  tipo: string;
  fecha: string | null;
  detalle: string | null;
}

export interface CronogramaActividades {
  disponible: boolean;
  motivo?: string;
  entries: CronogramaEntry[];
  resumenPorTipo: { tipo: string; count: number }[];
}

interface RawUpdateFull {
  text_body?: string | null;
  body?: string | null;
  created_at?: string | null;
  creator?: { id: string } | null;
}

const EMAIL_RE = /^(Outgoing|Incoming) Email/;

function parseEmailEntry(u: RawUpdateFull): CronogramaEntry {
  const texto = u.text_body ?? (u.body ?? "").replace(/<[^>]*>/g, " ");
  const direccion = /^Incoming/.test(texto.trim()) ? "De" : "Para";
  const campo = direccion === "De" ? /From:\s*([^\n]+)/ : /To:\s*([^\n]+)/;
  const match = texto.match(campo);
  const asuntoMatch = texto.match(/Sent At:[^\n]*\n+\s*([^\n]+)/);
  const partes = [match ? `${direccion}: ${match[1].trim()}` : null, asuntoMatch ? asuntoMatch[1].trim() : null].filter(Boolean);
  return { tipo: "Correo", fecha: u.created_at ?? null, detalle: partes.join(" — ") || null };
}

const emptyResult = (motivo: string): CronogramaActividades => ({ disponible: false, motivo, entries: [], resumenPorTipo: [] });

/** Cronograma de actividades (llamadas/reuniones/WhatsApp + correos) de un lead del board Leads Maxirent. */
export async function getActivityTimeline(leadItemId: string): Promise<CronogramaActividades> {
  if (isMondayMockMode) return emptyResult("Monday en modo demo.");
  const query = `
    query ($id: [ID!]) {
      items (ids: $id) {
        column_values (ids: ["${COL_LEAD_ACTIVIDADES_REL}"]) {
          ... on BoardRelationValue { linked_item_ids }
        }
        updates (limit: 100) { text_body body created_at creator { id } }
      }
    }
  `;
  type Raw = { items?: Array<{ column_values?: Array<{ linked_item_ids?: string[] }>; updates?: RawUpdateFull[] }> };
  const data: Raw = await mondayRequest(query, { id: [leadItemId] });
  const item = data?.items?.[0];
  if (!item) return emptyResult("No se encontró el lead en Monday.");

  const linkedIds = item.column_values?.[0]?.linked_item_ids ?? [];
  const entries: CronogramaEntry[] = [];

  if (linkedIds.length) {
    const actQuery = `
      query ($ids: [ID!]) {
        items (ids: $ids) {
          column_values (ids: ["${COL_ACT_TIPO}", "${COL_ACT_RESP}", "${COL_ACT_INICIO}", "${COL_ACT_DESC}"]) { id text }
        }
      }
    `;
    type ActRaw = { items?: Array<{ column_values?: Array<{ id: string; text?: string | null }> }> };
    const actData: ActRaw = await mondayRequest(actQuery, { ids: linkedIds });
    for (const it of actData?.items ?? []) {
      const cv = new Map((it.column_values ?? []).map((c) => [c.id, c.text ?? null]));
      entries.push({
        tipo: cv.get(COL_ACT_TIPO) || "Actividad",
        fecha: cv.get(COL_ACT_INICIO) ?? null,
        detalle: cv.get(COL_ACT_RESP) ?? cv.get(COL_ACT_DESC) ?? null
      });
    }
  }

  for (const u of item.updates ?? []) {
    const texto = (u.text_body ?? u.body ?? "").trim();
    if (u.creator == null && EMAIL_RE.test(texto)) entries.push(parseEmailEntry(u));
  }

  entries.sort((a, b) => {
    const ta = a.fecha ? Date.parse(a.fecha) : NaN;
    const tb = b.fecha ? Date.parse(b.fecha) : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });

  const conteo = new Map<string, number>();
  for (const e of entries) conteo.set(e.tipo, (conteo.get(e.tipo) ?? 0) + 1);
  const resumenPorTipo = [...conteo.entries()].map(([tipo, count]) => ({ tipo, count })).sort((a, b) => b.count - a.count);

  return { disponible: true, entries, resumenPorTipo };
}

/** Igual que `getActivityTimeline`, pero para un item del board "Time stamp" (Journey de Leads): resuelve primero su lead enlazado en Leads Maxirent. */
export async function getActivityTimelineForJourneyItem(timeStampItemId: string): Promise<CronogramaActividades> {
  if (isMondayMockMode) return emptyResult("Monday en modo demo.");
  const query = `
    query ($id: [ID!]) {
      items (ids: $id) {
        column_values (ids: ["${COL_TS_LEAD_REL}"]) {
          ... on BoardRelationValue { linked_item_ids }
        }
      }
    }
  `;
  type Raw = { items?: Array<{ column_values?: Array<{ linked_item_ids?: string[] }> }> };
  const data: Raw = await mondayRequest(query, { id: [timeStampItemId] });
  const leadId = data?.items?.[0]?.column_values?.[0]?.linked_item_ids?.[0];
  if (!leadId) return emptyResult("Este registro de Journey no está enlazado a un lead de Leads Maxirent.");
  return getActivityTimeline(leadId);
}
