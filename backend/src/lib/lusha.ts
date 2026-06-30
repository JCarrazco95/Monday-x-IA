// ===========================================================================
//  Lusha — proveedor B2B con cumplimiento (datos tipo LinkedIn, legal).
//
//  Lusha NO es scraping: es un proveedor que ya resolvió el consentimiento /
//  base legal de los datos y los expone por API. Por eso es la forma correcta
//  de tener "leads de LinkedIn" sin violar ToS ni la LFPDPPP.
//
//  Flujo oficial de Prospección (2 pasos):
//    1) SEARCH  → POST .../contact/search   (filtros) → requestId + ids (sin datos)
//    2) ENRICH  → POST .../contact/enrich   (requestId + contactIds) → datos reales
//  El paso 2 consume créditos del plan; por eso solo enriquecemos lo que pediste.
//
//  Auth: header `api_key: <LUSHA_API_KEY>`.
//
//  DEFENSIVO: si no hay key, la red falla, o la respuesta no trae el shape
//  esperado, devuelve null y la fuente cae a datos demo (no rompe el flujo).
//  Las rutas/campos son configurables por env por si tu plan usa otra versión.
// ===========================================================================

import type { Prospect } from "./leadSources.js";

const LUSHA_API_KEY = process.env.LUSHA_API_KEY;
const LUSHA_BASE = process.env.LUSHA_BASE_URL ?? "https://api.lusha.com/prospecting";
const LUSHA_SEARCH_PATH = process.env.LUSHA_SEARCH_PATH ?? "/contact/search";
const LUSHA_ENRICH_PATH = process.env.LUSHA_ENRICH_PATH ?? "/contact/enrich";
const LUSHA_TIMEOUT_MS = Number(process.env.LUSHA_TIMEOUT_MS ?? 12000);
// Si lo pones en "false", solo busca (no enriquece) y NO consume créditos —
// útil para validar la conexión sin gastar.
const LUSHA_REVEAL = (process.env.LUSHA_REVEAL ?? "true").toLowerCase() !== "false";

export const lushaEnabled = Boolean(LUSHA_API_KEY);

interface LushaSearchResponse {
  requestId?: string;
  data?: {
    id?: string | number;
    contactId?: string | number;
    name?: string;
    fullName?: string;
    jobTitle?: string;
    companyName?: string;
    company?: { name?: string };
    hasEmails?: boolean;
    hasPhones?: boolean;
  }[];
}

interface LushaEnrichContact {
  id?: string | number;
  contactId?: string | number;
  name?: string;
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  company?: { name?: string; fqdn?: string; website?: string; address?: string };
  emailAddresses?: { email?: string }[];
  emails?: { email?: string }[] | string[];
  phoneNumbers?: { number?: string }[];
  phones?: { number?: string }[] | string[];
  location?: string;
  country?: string;
}

interface LushaEnrichResponse {
  contacts?: { contactId?: string | number; id?: string | number; data?: LushaEnrichContact }[];
  data?: LushaEnrichContact[];
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", api_key: LUSHA_API_KEY! };
}

// Helper tolerante a variantes de array (objeto {email} o string directo).
function pickStr(arr: unknown, key: string): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const first = arr[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && key in first) {
    const v = (first as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  }
  return null;
}

/**
 * Busca prospectos en Lusha por sector + ciudad/país. Devuelve Prospect[]
 * normalizados o null si no se pudo (sin key, error de red, shape inesperado).
 */
export async function searchLushaProspects(params: {
  sector: string;
  ciudad?: string;
  limite?: number;
}): Promise<Prospect[] | null> {
  if (!LUSHA_API_KEY) return null;
  const limit = Math.min(Math.max(params.limite ?? 20, 1), 40);

  // ── Paso 1: SEARCH (no consume créditos) ──────────────────────────────────
  let search: LushaSearchResponse;
  try {
    const body = {
      filters: {
        companies: {
          industriesLabels: [params.sector],
          ...(params.ciudad ? { locations: [params.ciudad] } : {})
        }
      },
      pages: { page: 0, size: limit }
    };
    const res = await fetch(`${LUSHA_BASE}${LUSHA_SEARCH_PATH}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LUSHA_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    search = (await res.json()) as LushaSearchResponse;
  } catch {
    return null;
  }

  const requestId = search.requestId;
  const previews = search.data ?? [];
  const ids = previews
    .map((p) => p.contactId ?? p.id)
    .filter((x): x is string | number => x !== undefined && x !== null)
    .slice(0, limit);

  if (ids.length === 0) return [];

  // Si no queremos revelar (ahorro de créditos) o falta requestId, devolvemos
  // lo que ya trae el preview (nombre/empresa/cargo sin email/teléfono).
  if (!LUSHA_REVEAL || !requestId) {
    return previews.map((p) => ({
      nombre: p.companyName ?? p.company?.name ?? p.name ?? p.fullName ?? "Empresa sin nombre",
      telefono: null,
      email: null,
      sitioWeb: null,
      direccion: null,
      categoria: [p.jobTitle, p.name ?? p.fullName].filter(Boolean).join(" · ") || params.sector,
      fuente: "lusha",
      externalId: String(p.contactId ?? p.id ?? "")
    }));
  }

  // ── Paso 2: ENRICH (consume créditos por dato revelado) ───────────────────
  let enrich: LushaEnrichResponse;
  try {
    const res = await fetch(`${LUSHA_BASE}${LUSHA_ENRICH_PATH}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ requestId, contactIds: ids }),
      signal: AbortSignal.timeout(LUSHA_TIMEOUT_MS)
    });
    if (!res.ok) return null;
    enrich = (await res.json()) as LushaEnrichResponse;
  } catch {
    return null;
  }

  const contacts: LushaEnrichContact[] = enrich.contacts
    ? enrich.contacts.map((c) => c.data ?? (c as LushaEnrichContact))
    : enrich.data ?? [];

  return contacts.map((c) => {
    const persona = c.name ?? c.fullName ?? null;
    const empresa = c.companyName ?? c.company?.name ?? persona ?? "Empresa sin nombre";
    const email = c.emailAddresses?.[0]?.email ?? pickStr(c.emails, "email");
    const telefono = c.phoneNumbers?.[0]?.number ?? pickStr(c.phones, "number");
    const web = c.company?.website ?? (c.company?.fqdn ? `https://${c.company.fqdn}` : null);
    const direccion = c.company?.address ?? c.location ?? c.country ?? null;
    return {
      nombre: empresa,
      telefono: telefono ?? null,
      email: email ?? null,
      sitioWeb: web,
      direccion,
      categoria: [c.jobTitle, persona].filter(Boolean).join(" · ") || params.sector,
      fuente: "lusha",
      externalId: String(c.contactId ?? c.id ?? email ?? empresa)
    };
  });
}
