const MONDAY_API_URL = process.env.MONDAY_API_URL ?? "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

export const isMondayMockMode = !MONDAY_API_TOKEN;

/**
 * Cliente mínimo para la API GraphQL de Monday.com.
 * En modo mock (sin token configurado) simplemente registra la llamada
 * y devuelve un resultado simulado, para poder probar el flujo completo
 * sin credenciales reales.
 */
export async function mondayRequest<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  if (isMondayMockMode) {
    return {
      mock: true,
      query: query.trim().slice(0, 120),
      variables
    } as unknown as T;
  }

  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_TOKEN!
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Monday API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: T; errors?: unknown[] };
  if (json.errors?.length) {
    throw new Error(`Monday API GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

export async function createMondayItem(opts: {
  boardId?: string;
  itemName: string;
  columnValues?: Record<string, unknown>;
  /** Grupo del board donde crear el item (opcional). Si no, va al grupo por defecto. */
  groupId?: string;
}): Promise<{ create_item?: { id: string } }> {
  const boardId = opts.boardId ?? process.env.MONDAY_BOARD_ID_LEADS;
  // Si se pasa groupId, lo incluimos como argumento opcional de la mutación.
  const query = `
    mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON, $groupId: String) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues, group_id: $groupId) {
        id
      }
    }
  `;
  return mondayRequest<{ create_item?: { id: string } }>(query, {
    boardId,
    itemName: opts.itemName,
    columnValues: opts.columnValues ? JSON.stringify(opts.columnValues) : undefined,
    groupId: opts.groupId ?? null
  });
}

export interface MondayItemData {
  id: string;
  name: string;
  columns: { id: string; title: string; text: string }[];
}

/** Lee un item de Monday con sus columnas (id, título y texto legible). */
export async function getMondayItem(itemId: string): Promise<MondayItemData | null> {
  if (isMondayMockMode) return null;
  const query = `
    query ($ids: [ID!]) {
      items (ids: $ids) {
        id
        name
        column_values { id text column { title } }
      }
    }
  `;
  const data = await mondayRequest<{ items?: Array<{ id: string; name: string; column_values?: Array<{ id: string; text?: string; column?: { title?: string } }> }> }>(query, { ids: [itemId] });
  const it = data?.items?.[0];
  if (!it) return null;
  return {
    id: it.id,
    name: it.name,
    columns: (it.column_values ?? []).map((c) => ({ id: c.id, title: c.column?.title ?? "", text: c.text ?? "" }))
  };
}

/** Lista las columnas (id, título, tipo) de un board. Útil para mapear IDs reales. */
export async function getBoardColumns(
  boardId: string
): Promise<{ id: string; title: string; type: string }[]> {
  const query = `
    query ($ids: [ID!]) {
      boards (ids: $ids) {
        id
        name
        columns { id title type }
      }
    }
  `;
  const data = await mondayRequest<{ boards?: Array<{ columns?: Array<{ id: string; title: string; type: string }> }> }>(
    query,
    { ids: [boardId] }
  );
  return data?.boards?.[0]?.columns ?? [];
}

// ===========================================================================
//  Tablero de llamadas de Aircall en Monday.
//  Aircall registra cada llamada como un item con: el call id (texto), un link a
//  la llamada (con grabación/transcripción) y la relación al lead. Leemos esos
//  items para analizarlos en Call Intelligence. IDs configurables por env.
// ===========================================================================
const CALLS_BOARD_ID = process.env.MONDAY_BOARD_ID_CALLS ?? "18398458590";
const CALLS_COL_ID = process.env.MONDAY_COL_CALL_ID ?? "text_mm07x5tn";
const CALLS_COL_LINK = process.env.MONDAY_COL_CALL_LINK ?? "link_mm07s8jf";
const CALLS_COL_LEAD = process.env.MONDAY_COL_CALL_LEAD ?? "board_relation_mm1whczc";
const CALLS_COL_DATE = process.env.MONDAY_COL_CALL_DATE ?? "date_mm07gzt1"; // "Started At"

export interface CallBoardItem {
  itemId: string;
  itemName: string;
  callId: string | null;
  link: string | null;
  leadId: string | null;
  leadName: string | null;
  startedAt: string | null; // ISO (para ordenar/filtrar por fecha)
}

export const callsBoardConfigured = Boolean(CALLS_BOARD_ID);

/** Lee las llamadas registradas en el tablero de Aircall (call id, link, lead). */
export async function getCallsBoardItems(limit = 200): Promise<CallBoardItem[]> {
  if (isMondayMockMode || !CALLS_BOARD_ID) return [];
  const query = `
    query ($ids: [ID!], $cols: [String!], $limit: Int!) {
      boards (ids: $ids) {
        items_page (limit: $limit) {
          items {
            id
            name
            column_values (ids: $cols) {
              id
              type
              text
              value
              ... on BoardRelationValue { linked_item_ids display_value }
              ... on LinkValue { url }
              ... on DateValue { date time }
            }
          }
        }
      }
    }
  `;
  type CV = { id: string; type?: string; text?: string; value?: string; url?: string; linked_item_ids?: string[]; display_value?: string; date?: string; time?: string };
  const data = await mondayRequest<{ boards?: Array<{ items_page?: { items?: Array<{ id: string; name: string; column_values?: CV[] }> } }> }>(
    query,
    { ids: [CALLS_BOARD_ID], cols: [CALLS_COL_ID, CALLS_COL_LINK, CALLS_COL_LEAD, CALLS_COL_DATE], limit }
  );
  const items = data?.boards?.[0]?.items_page?.items ?? [];
  const mapped: CallBoardItem[] = items.map((it) => {
    const cvs = it.column_values ?? [];
    const byId = (id: string) => cvs.find((c) => c.id === id);
    const callCv = byId(CALLS_COL_ID);
    const linkCv = byId(CALLS_COL_LINK);
    const leadCv = byId(CALLS_COL_LEAD);
    const dateCv = byId(CALLS_COL_DATE);
    // El link puede venir como url (LinkValue) o dentro del JSON `value`.
    let link: string | null = linkCv?.url ?? null;
    if (!link && linkCv?.value) {
      try { link = (JSON.parse(linkCv.value) as { url?: string }).url ?? null; } catch { /* noop */ }
    }
    if (!link && linkCv?.text) link = linkCv.text.split(" - ")[0] || null;
    // Fecha ISO desde DateValue (date + time) o el texto de la columna.
    let startedAt: string | null = null;
    if (dateCv?.date) startedAt = dateCv.time ? `${dateCv.date}T${dateCv.time}Z` : `${dateCv.date}T00:00:00Z`;
    else if (dateCv?.text) startedAt = dateCv.text;
    return {
      itemId: it.id,
      itemName: it.name,
      callId: callCv?.text?.trim() || null,
      link,
      leadId: leadCv?.linked_item_ids?.[0] ?? null,
      leadName: leadCv?.display_value?.trim() || null,
      startedAt
    };
  });
  // Más recientes primero (los sin fecha, al final).
  mapped.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  return mapped;
}

export async function updateMondayColumn(opts: {
  boardId: string;
  itemId: string;
  columnId: string;
  value: unknown;
}) {
  // change_simple_column_value acepta un STRING plano y funciona para texto,
  // números (como "93") y estado (por etiqueta). create_labels_if_missing crea
  // la etiqueta de estado (p.ej. "Sí"/"No") si aún no existe. Más robusto que
  // change_column_value, que exige un JSON distinto por tipo de columna.
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String) {
      change_simple_column_value(
        board_id: $boardId, item_id: $itemId, column_id: $columnId,
        value: $value, create_labels_if_missing: true
      ) {
        id
      }
    }
  `;
  const value = opts.value === null || opts.value === undefined ? "" : String(opts.value);
  return mondayRequest(query, {
    boardId: opts.boardId,
    itemId: opts.itemId,
    columnId: opts.columnId,
    value
  });
}

export async function createMondaySubitem(opts: {
  parentItemId: string;
  itemName: string;
  columnValues?: Record<string, unknown>;
}) {
  const query = `
    mutation ($parentItemId: ID!, $itemName: String!, $columnValues: JSON) {
      create_subitem(parent_item_id: $parentItemId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;
  return mondayRequest(query, {
    parentItemId: opts.parentItemId,
    itemName: opts.itemName,
    columnValues: opts.columnValues ? JSON.stringify(opts.columnValues) : undefined
  });
}

export async function postMondayComment(opts: { itemId: string; body: string }) {
  const query = `
    mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
      }
    }
  `;
  return mondayRequest(query, { itemId: opts.itemId, body: opts.body });
}
