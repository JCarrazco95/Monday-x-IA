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
