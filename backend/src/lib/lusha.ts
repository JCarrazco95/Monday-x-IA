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
// Lusha exige un tamaño de página mínimo de 10. Pedimos al menos eso y luego
// recortamos al límite real solicitado por el usuario.
const LUSHA_MIN_PAGE_SIZE = 10;

export const lushaEnabled = Boolean(LUSHA_API_KEY);

interface LushaSearchResponse {
  requestId?: string;
  totalResults?: number;
  data?: {
    id?: string | number;
    contactId?: string | number;
    name?: string;
    fullName?: string;
    jobTitle?: string;
    companyName?: string;
    company?: { name?: string };
    fqdn?: string;
    companyId?: number | string;
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
 * Construye el cuerpo del SEARCH. Los filtros van envueltos en `include` dentro
 * de companies. El filtro fiable es UBICACIÓN (locations = array de OBJETOS
 * {city}/{country}); sin ciudad usamos país por defecto. `sector` se aplica
 * como industriesLabels SOLO si `useIndustry` (debe coincidir con el catálogo
 * exacto de Lusha; si no, da 0 resultados → el adaptador reintenta sin él).
 */
const LUSHA_DEFAULT_COUNTRY = process.env.LUSHA_DEFAULT_COUNTRY ?? "Mexico";

function buildSearchBody(
  sector: string,
  ciudad: string | undefined,
  size: number,
  useIndustry = false,
  page = 0
): Record<string, unknown> {
  const companyInclude: Record<string, unknown> = {
    locations: ciudad ? [{ city: ciudad }] : [{ country: LUSHA_DEFAULT_COUNTRY }]
  };
  if (useIndustry && sector.trim()) companyInclude.industriesLabels = [sector.trim()];
  return {
    filters: { companies: { include: companyInclude } },
    pages: { page: Math.max(page, 0), size }
  };
}

/**
 * Diagnóstico de conexión: hace SOLO el search (no gasta créditos) y reporta el
 * status HTTP. No expone la API key ni los datos de contactos. Sirve para saber
 * si el fallo es de plan (401/403), endpoint (404), filtros (400) o red.
 */
export async function diagnoseLusha(params: {
  sector?: string;
  ciudad?: string;
}): Promise<{ configured: boolean; ok: boolean; status: number | null; detail: string }> {
  if (!LUSHA_API_KEY) {
    return { configured: false, ok: false, status: null, detail: "Falta LUSHA_API_KEY." };
  }
  const url = `${LUSHA_BASE}${LUSHA_SEARCH_PATH}`;
  try {
    const body = buildSearchBody(params.sector || "", params.ciudad, LUSHA_MIN_PAGE_SIZE);
    const res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LUSHA_TIMEOUT_MS)
    });
    // En error mostramos el mensaje de Lusha (sin datos de contactos); en OK no.
    const detailBody = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 300);
    return {
      configured: true,
      ok: res.ok,
      status: res.status,
      detail: res.ok ? `Conexión OK (${url})` : `Lusha respondió ${res.status}: ${detailBody || "(sin cuerpo)"}`
    };
  } catch (err) {
    return { configured: true, ok: false, status: null, detail: `Error de red/timeout: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Busca prospectos en Lusha por sector + ciudad/país. Devuelve Prospect[]
 * normalizados o null si no se pudo (sin key, error de red, shape inesperado).
 */
export async function searchLushaProspects(params: {
  sector: string;
  ciudad?: string;
  limite?: number;
  page?: number;
}): Promise<Prospect[] | null> {
  if (!LUSHA_API_KEY) return null;
  const limit = Math.min(Math.max(params.limite ?? 20, 1), 40);
  const page = Math.max(params.page ?? 0, 0);

  const size = Math.max(limit, LUSHA_MIN_PAGE_SIZE);

  // Una pasada de SEARCH (no consume créditos). Devuelve la respuesta o null.
  const attempt = async (useIndustry: boolean): Promise<LushaSearchResponse | null> => {
    try {
      const res = await fetch(`${LUSHA_BASE}${LUSHA_SEARCH_PATH}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(buildSearchBody(params.sector, params.ciudad, size, useIndustry, page)),
        signal: AbortSignal.timeout(LUSHA_TIMEOUT_MS)
      });
      if (!res.ok) return null;
      return (await res.json()) as LushaSearchResponse;
    } catch {
      return null;
    }
  };

  // ── Paso 1: SEARCH ────────────────────────────────────────────────────────
  // Primero intentamos con el sector como industria (por si coincide con el
  // catálogo de Lusha); si da 0, reintentamos solo por ubicación (fiable).
  let search = await attempt(true);
  if (!search || (search.data?.length ?? 0) === 0) {
    const widened = await attempt(false);
    if (widened) search = widened;
  }
  if (!search) return null;

  // Dedupe por empresa: nos quedamos con un contacto por compañía (el primero,
  // que Lusha ordena por relevancia/seniority).
  const seenCo = new Set<string>();
  const previews = (search.data ?? []).filter((p) => {
    const co = (p.companyName ?? p.company?.name ?? "").toLowerCase().trim();
    if (!co) return true;
    if (seenCo.has(co)) return false;
    seenCo.add(co);
    return true;
  });

  const requestId = search.requestId;
  const ids = previews
    .map((p) => p.contactId ?? p.id)
    .filter((x): x is string | number => x !== undefined && x !== null)
    .slice(0, limit);

  if (ids.length === 0) return [];

  // Mapea un preview (sin email/teléfono: eso requiere reveal) a Prospect.
  const mapPreview = (p: NonNullable<LushaSearchResponse["data"]>[number]): Prospect => ({
    nombre: p.companyName ?? p.company?.name ?? p.name ?? p.fullName ?? "Empresa sin nombre",
    telefono: null,
    email: null,
    sitioWeb: p.fqdn ? `https://${p.fqdn}` : null,
    direccion: params.ciudad ?? null,
    categoria: [p.jobTitle, p.name ?? p.fullName].filter(Boolean).join(" · ") || params.sector,
    fuente: "lusha",
    externalId: String(p.contactId ?? p.id ?? "")
  });

  // Si no revelamos (ahorro de créditos) o falta requestId, devolvemos el
  // preview (empresa/cargo/contacto/web), sin gastar.
  if (!LUSHA_REVEAL || !requestId) {
    return previews.slice(0, limit).map(mapPreview);
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
