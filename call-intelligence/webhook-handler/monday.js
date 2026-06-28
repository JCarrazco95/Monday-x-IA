// Helpers minimos para la API GraphQL v2 de monday.
const API = 'https://api.monday.com/v2';

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.MONDAY_TOKEN,
      'API-Version': '2024-10'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error('monday API: ' + JSON.stringify(json.errors));
  return json.data;
}

// Lee un item con todas sus columnas.
export async function getItem(itemId) {
  const q = `query($id:[ID!]){ items(ids:$id){ id name column_values{ id text value } } }`;
  const d = await gql(q, { id: [String(itemId)] });
  return d.items && d.items[0];
}

// Devuelve el texto "plano" de una columna por su id.
export function colText(item, colId) {
  if (!item || !colId) return '';
  const c = item.column_values.find(c => c.id === colId);
  if (!c) return '';
  if (c.text) return c.text;
  try { const v = JSON.parse(c.value || 'null'); return (v && (v.url || v.text)) || ''; } catch { return ''; }
}

// Escribe varias columnas de una sola llamada (change_multiple_column_values).
export async function setColumns(boardId, itemId, valuesObj) {
  const q = `mutation($b:ID!,$i:ID!,$v:JSON!){
    change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){ id } }`;
  return gql(q, { b: String(boardId), i: String(itemId), v: JSON.stringify(valuesObj) });
}

// Publica un update (comentario) en el item con un resumen legible.
export async function postUpdate(itemId, body) {
  const q = `mutation($i:ID!,$b:String!){ create_update(item_id:$i, body:$b){ id } }`;
  return gql(q, { i: String(itemId), b: body });
}
