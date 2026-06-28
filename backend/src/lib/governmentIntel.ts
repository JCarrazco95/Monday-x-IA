// ===========================================================================
//  Inteligencia gubernamental — API de Contrataciones Abiertas (CompraNet).
//
//  Consulta la API oficial OCDS de la APF para detectar si una empresa tiene
//  contratos o licitaciones con el gobierno (señal de capacidad de pago y
//  proyectos grandes recurrentes).
//
//  Endpoint:  https://api.datos.gob.mx/v2/contratacionesabiertas
//  Filtro:    records.compiledRelease.parties.name=<razón social>
//  Respuesta: { pagination?: { total }, results: [ { compiledRelease: {...} } ] }
//
//  Si la API no responde o está deshabilitada, devuelve null y el sistema cae
//  a la inferencia de la IA (comportamiento previo).
// ===========================================================================

const GOV_API_URL =
  process.env.GOV_API_URL ?? "https://api.datos.gob.mx/v2/contratacionesabiertas";
const GOV_API_ENABLED = (process.env.GOV_API_ENABLED ?? "true").toLowerCase() !== "false";
const GOV_API_TIMEOUT_MS = Number(process.env.GOV_API_TIMEOUT_MS ?? 8000);

export interface GovContractsResult {
  tieneContratos: boolean;
  total: number;
  detalle: string;
  fuente: string;
  ejemplos: { titulo: string; comprador?: string; fecha?: string }[];
}

interface OcdsParty {
  name?: string;
  roles?: string[];
}
interface OcdsCompiledRelease {
  tender?: { title?: string; tenderPeriod?: { startDate?: string } };
  awards?: { title?: string }[];
  contracts?: { title?: string }[];
  parties?: OcdsParty[];
  buyer?: { name?: string };
  date?: string;
}
interface OcdsRecord {
  compiledRelease?: OcdsCompiledRelease;
}
interface OcdsResponse {
  pagination?: { total?: number };
  total?: number;
  results?: OcdsRecord[];
  data?: OcdsRecord[];
}

/**
 * Busca contratos públicos por razón social del proveedor.
 * Devuelve null si está deshabilitada, sin razón social, o si la API falla.
 */
export async function searchGovernmentContracts(
  razonSocial?: string | null
): Promise<GovContractsResult | null> {
  const name = razonSocial?.trim();
  if (!GOV_API_ENABLED || !name) return null;

  const url = `${GOV_API_URL}?records.compiledRelease.parties.name=${encodeURIComponent(name)}&pageSize=5`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GOV_API_TIMEOUT_MS)
    });
    if (!res.ok) return null;

    const json = (await res.json()) as OcdsResponse;

    // Tolerante a variantes: results | data | array directo.
    const records: OcdsRecord[] = Array.isArray(json)
      ? (json as OcdsRecord[])
      : json.results ?? json.data ?? [];
    const total = json.pagination?.total ?? json.total ?? records.length;

    if (!total || records.length === 0) {
      return {
        tieneContratos: false,
        total: 0,
        detalle: "Sin contratos públicos encontrados en CompraNet (Contrataciones Abiertas).",
        fuente: GOV_API_URL,
        ejemplos: []
      };
    }

    const ejemplos = records.slice(0, 3).map((rec) => {
      const cr = rec.compiledRelease ?? {};
      const comprador =
        cr.buyer?.name ??
        cr.parties?.find((p) => (p.roles ?? []).includes("buyer"))?.name ??
        undefined;
      const titulo =
        cr.tender?.title ??
        cr.awards?.[0]?.title ??
        cr.contracts?.[0]?.title ??
        "Contrato público";
      const fecha = cr.date ?? cr.tender?.tenderPeriod?.startDate;
      return { titulo, comprador, fecha };
    });

    return {
      tieneContratos: true,
      total,
      detalle: `${total} contrato(s)/procedimiento(s) público(s) encontrado(s) en CompraNet${
        ejemplos[0]?.comprador ? ` (p. ej. con ${ejemplos[0].comprador})` : ""
      }.`,
      fuente: GOV_API_URL,
      ejemplos
    };
  } catch {
    // Timeout, red o formato inesperado → dejamos que la IA infiera.
    return null;
  }
}
