// ===========================================================================
//  Mapeo de columnas de Monday -> payload de lead_created.
//  Compartido por el webhook nativo (routes/webhooks.ts) y el sync del
//  tablero de Leads (lib/leadsSync.ts) para no duplicar la lógica de "adivinar"
//  qué columna es cuál (por ID de env o por título).
// ===========================================================================

export type MondayCol = { id: string; title: string; text: string };

// Permite forzar el id de columna por env (si el match por título no basta).
const COL = {
  email: process.env.MONDAY_COL_EMAIL,
  telefono: process.env.MONDAY_COL_TELEFONO,
  razonSocial: process.env.MONDAY_COL_RAZON_SOCIAL,
  rfc: process.env.MONDAY_COL_RFC,
  nombre: process.env.MONDAY_COL_NOMBRE
};

function pick(cols: MondayCol[], envId: string | undefined, re: RegExp): string | undefined {
  if (envId) {
    const byId = cols.find((c) => c.id === envId)?.text;
    if (byId) return byId;
  }
  const byTitle = cols.find((c) => re.test(c.title))?.text;
  return byTitle || undefined;
}

export interface LeadCreatedPayload {
  nombre: string;
  email?: string;
  telefono?: string;
  razonSocial?: string;
  rfc?: string;
  [key: string]: unknown;
}

/** Traduce las columnas crudas de un item de Monday al payload de `lead_created`. */
export function mapLeadColumns(cols: MondayCol[], fallbackName: string): LeadCreatedPayload {
  return {
    nombre: pick(cols, COL.nombre, /nombre|contacto|name/i) ?? fallbackName,
    email: pick(cols, COL.email, /email|correo|mail/i),
    telefono: pick(cols, COL.telefono, /tel|phone|cel|whats/i),
    razonSocial: pick(cols, COL.razonSocial, /raz[oó]n|empresa|company|negocio/i),
    rfc: pick(cols, COL.rfc, /rfc/i)
  };
}
