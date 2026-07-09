// ===========================================================================
//  Fuentes de prospección de leads (scraper) — arquitectura conectable.
//
//  Cada "fuente" implementa una interfaz común: dado un sector + ciudad,
//  devuelve una lista de prospectos normalizados. Así se pueden enchufar
//  nuevas fuentes (Google Places, licitaciones, proveedor B2B, CSV…) sin tocar
//  el agente ni el frontend.
//
//  PRINCIPIO LEGAL: priorizamos APIs OFICIALES y datos PÚBLICOS. No scrapeamos
//  HTML de sitios que lo prohíben (LinkedIn, directorios privados). Para datos
//  tipo LinkedIn se enchufa un proveedor B2B con cumplimiento (Apollo/Lusha…)
//  vía su API — hueco preparado en `b2bProviderSource` (deshabilitado por
//  defecto hasta que se configure).
//
//  DEFENSIVO: si falta credencial o falla la red, cada fuente cae a datos demo
//  realistas (no rompe el flujo) y marca `demo: true`.
// ===========================================================================

import { lushaEnabled, searchLushaProspects } from "./lusha.js";

export interface Prospect {
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  sitioWeb?: string | null;
  direccion?: string | null;
  categoria?: string | null;
  /** id de la fuente (google_places | gov | b2b | csv | directorio). */
  fuente: string;
  /** id externo estable para deduplicar (place_id, etc.). */
  externalId?: string | null;
}

export interface SearchParams {
  sector: string;
  ciudad?: string;
  limite?: number;
  /** Página (0-based) para fuentes que paginan (Lusha). Permite traer leads nuevos. */
  page?: number;
}

export interface LeadSource {
  id: string;
  label: string;
  /** ¿Hay credencial/configuración real? Si no, la fuente usa demo. */
  enabled: boolean;
  /** ¿Esta fuente tiene consideraciones legales que mostrar al usuario? */
  aviso?: string;
  search(params: SearchParams): Promise<{ prospects: Prospect[]; demo: boolean }>;
}

const DEFAULT_LIMIT = 20;
const clampLimit = (n?: number) => Math.min(Math.max(n ?? DEFAULT_LIMIT, 1), 40);

// ─── Demo: genera prospectos realistas de Monterrey por sector ───────────────
function demoProspects(params: SearchParams, fuente: string): Prospect[] {
  const ciudad = params.ciudad?.trim() || "Monterrey";
  const sector = params.sector?.trim() || "empresas";
  const bases = [
    "Grupo", "Comercializadora", "Constructora", "Transportes", "Logística",
    "Servicios", "Distribuidora", "Industrias", "Corporativo", "Operadora"
  ];
  const apellidos = ["del Norte", "Regiomontana", "Monterrey", "Industrial", "del Bajío", "Premier", "Integral", "Express", "Continental", "Nacional"];
  const colonias = ["Centro", "San Pedro", "Cumbres", "Valle Oriente", "Apodaca", "Guadalupe", "Santa Catarina", "Escobedo"];
  const n = clampLimit(params.limite);
  const out: Prospect[] = [];
  for (let i = 0; i < n; i++) {
    const nombre = `${bases[i % bases.length]} ${apellidos[(i * 3) % apellidos.length]} ${sector.split(" ")[0]}`.replace(/\s+/g, " ").trim();
    const tel = `81${String(10000000 + ((i * 73 + 17) % 89999999)).slice(0, 8)}`;
    out.push({
      nombre,
      telefono: tel,
      email: null,
      sitioWeb: `https://www.${bases[i % bases.length].toLowerCase()}${i}.com.mx`,
      direccion: `Av. ${colonias[i % colonias.length]} ${100 + i}, ${ciudad}, N.L.`,
      categoria: sector,
      fuente,
      externalId: `demo-${fuente}-${i}`
    });
  }
  return out;
}

// ─── Fuente: Google Places API (oficial, legal) ─────────────────────────────
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_URL =
  process.env.GOOGLE_PLACES_URL ?? "https://places.googleapis.com/v1/places:searchText";
const PLACES_TIMEOUT_MS = Number(process.env.GOOGLE_PLACES_TIMEOUT_MS ?? 9000);

interface PlacesResponse {
  places?: {
    id?: string;
    displayName?: { text?: string };
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    formattedAddress?: string;
    primaryTypeDisplayName?: { text?: string };
  }[];
}

const googlePlacesSource: LeadSource = {
  id: "google_places",
  label: "Google Places",
  enabled: Boolean(GOOGLE_PLACES_KEY),
  async search(params) {
    if (!GOOGLE_PLACES_KEY) return { prospects: demoProspects(params, "google_places"), demo: true };
    const ciudad = params.ciudad?.trim() || "Monterrey";
    const textQuery = `${params.sector} en ${ciudad}`;
    try {
      const res = await fetch(GOOGLE_PLACES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
          // Pedimos solo los campos que usamos (controla el costo de la API).
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName"
        },
        body: JSON.stringify({ textQuery, languageCode: "es", maxResultCount: clampLimit(params.limite) }),
        signal: AbortSignal.timeout(PLACES_TIMEOUT_MS)
      });
      if (!res.ok) return { prospects: demoProspects(params, "google_places"), demo: true };
      const json = (await res.json()) as PlacesResponse;
      const prospects: Prospect[] = (json.places ?? []).map((p) => ({
        nombre: p.displayName?.text?.trim() || "Empresa sin nombre",
        telefono: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
        email: null,
        sitioWeb: p.websiteUri || null,
        direccion: p.formattedAddress || null,
        categoria: p.primaryTypeDisplayName?.text || params.sector,
        fuente: "google_places",
        externalId: p.id || null
      }));
      return { prospects, demo: false };
    } catch {
      return { prospects: demoProspects(params, "google_places"), demo: true };
    }
  }
};

// ─── Fuente: Licitaciones de gobierno (CompraNet / Contrataciones Abiertas) ──
//  Datos públicos. Busca procedimientos por palabra clave y extrae a los
//  PROVEEDORES (parties con rol supplier/tenderer) como prospectos: empresas
//  que ganan contratos suelen necesitar flotilla.
//
//  ⚠️ La API pública original (api.datos.gob.mx) fue DESCONTINUADA: sin una
//  GOV_API_URL explícita (formato OCDS) la fuente queda como NO configurada
//  y usa demo — así el panel lo muestra honesto en vez de fingir datos reales.
const GOV_API_URL = process.env.GOV_API_URL ?? "";
const GOV_API_ENABLED =
  Boolean(GOV_API_URL) && (process.env.GOV_API_ENABLED ?? "true").toLowerCase() !== "false";
const GOV_TIMEOUT_MS = Number(process.env.GOV_API_TIMEOUT_MS ?? 8000);

interface GovOcdsResponse {
  results?: {
    compiledRelease?: {
      parties?: { name?: string; roles?: string[]; contactPoint?: { telephone?: string; email?: string; url?: string }; address?: { streetAddress?: string; locality?: string; region?: string } }[];
      tender?: { title?: string };
    };
  }[];
}

const governmentSource: LeadSource = {
  id: "gov",
  label: "Licitaciones de gobierno",
  enabled: GOV_API_ENABLED,
  aviso: GOV_API_ENABLED
    ? "Datos públicos (Contrataciones Abiertas / CompraNet)."
    : "La API pública de datos.gob.mx fue descontinuada. Configura GOV_API_URL (endpoint OCDS) para activar esta fuente; mientras, muestra datos de demostración.",
  async search(params) {
    if (!GOV_API_ENABLED) return { prospects: demoProspects(params, "gov"), demo: true };
    const limite = clampLimit(params.limite);
    const url = `${GOV_API_URL}?query=${encodeURIComponent(params.sector)}&pageSize=${limite}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(GOV_TIMEOUT_MS)
      });
      if (!res.ok) return { prospects: demoProspects(params, "gov"), demo: true };
      const json = (await res.json()) as GovOcdsResponse;
      const seen = new Set<string>();
      const prospects: Prospect[] = [];
      for (const rec of json.results ?? []) {
        const parties = rec.compiledRelease?.parties ?? [];
        for (const p of parties) {
          const isSupplier = (p.roles ?? []).some((r) => /supplier|tenderer|payee/i.test(r));
          const nombre = p.name?.trim();
          if (!isSupplier || !nombre || seen.has(nombre.toLowerCase())) continue;
          seen.add(nombre.toLowerCase());
          prospects.push({
            nombre,
            telefono: p.contactPoint?.telephone || null,
            email: p.contactPoint?.email || null,
            sitioWeb: p.contactPoint?.url || null,
            direccion: [p.address?.streetAddress, p.address?.locality, p.address?.region].filter(Boolean).join(", ") || null,
            categoria: rec.compiledRelease?.tender?.title || params.sector,
            fuente: "gov",
            externalId: nombre.toLowerCase()
          });
          if (prospects.length >= limite) break;
        }
        if (prospects.length >= limite) break;
      }
      if (prospects.length === 0) return { prospects: demoProspects(params, "gov"), demo: true };
      return { prospects, demo: false };
    } catch {
      return { prospects: demoProspects(params, "gov"), demo: true };
    }
  }
};

// ─── Fuente: Lusha — proveedor B2B con cumplimiento (datos tipo LinkedIn) ────
//  NO es scraping de LinkedIn (eso viola sus ToS y la LFPDPPP). Lusha ya resolvió
//  la base legal de los datos y los expone por API (flujo search → enrich).
//  Se activa con LUSHA_API_KEY. Sin key, o si la API falla, cae a demo.
const lushaSource: LeadSource = {
  id: "lusha",
  label: "Lusha (B2B tipo LinkedIn)",
  enabled: lushaEnabled,
  aviso:
    "Contactos vía Lusha (proveedor con cumplimiento). Filtra por ubicación (la ciudad que indiques, o México por defecto); el sector se aplica solo si coincide con el catálogo de Lusha. El email/teléfono requiere reveal y consume créditos (LUSHA_REVEAL=false los omite). NO se scrapea LinkedIn directamente.",
  async search(params) {
    const prospects = await searchLushaProspects(params);
    if (prospects === null) return { prospects: demoProspects(params, "lusha"), demo: true };
    return { prospects, demo: false };
  }
};

// ─── Fuente: directorios web (HTML) — STUB, bajo riesgo del cliente ─────────
//  Scraping de HTML es frágil y gris legalmente (ToS). Se deja como stub
//  deshabilitado; si se activa, debe implementarse respetando robots.txt.
const DIRECTORY_ENABLED = (process.env.DIRECTORY_SCRAPER_ENABLED ?? "false").toLowerCase() === "true";

const directorySource: LeadSource = {
  id: "directorio",
  label: "Directorios web",
  enabled: DIRECTORY_ENABLED,
  aviso: "Scraping de HTML: frágil y sujeto a los Términos de cada sitio. Úsese bajo criterio del cliente.",
  async search(params) {
    return { prospects: demoProspects(params, "directorio"), demo: true };
  }
};

// ─── Registro de fuentes ─────────────────────────────────────────────────────
const SOURCES: LeadSource[] = [
  googlePlacesSource,
  governmentSource,
  lushaSource,
  directorySource
];

export function listLeadSources(): { id: string; label: string; enabled: boolean; aviso?: string }[] {
  return SOURCES.map(({ id, label, enabled, aviso }) => ({ id, label, enabled, aviso }));
}

export function getLeadSource(id: string): LeadSource | undefined {
  return SOURCES.find((s) => s.id === id);
}
