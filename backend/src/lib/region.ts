// ===========================================================================
//  Región aproximada de un lead a partir del LADA de su teléfono.
//
//  No hay un campo de "estado/región" capturado en el formulario ni en Monday;
//  en vez de agregar una columna nueva, se DERIVA del teléfono (que sí está
//  presente en casi todos los leads) — a diferencia de `research.ubicacion`
//  (texto libre de la investigación de IA, opcional e inconsistente).
//
//  El mapeo cubre los LADAs de las zonas metropolitanas y corredores
//  industriales más relevantes para MAXIRent (flotillas B2B); es una
//  aproximación por macro-región, no un catálogo exhaustivo de los ~350 LADAs
//  de México. Lo no reconocido cae en "Otra".
// ===========================================================================

export const REGIONES = ["Noreste", "Norte", "Occidente", "Bajío", "Centro", "Sureste", "Otra"] as const;
export type Region = (typeof REGIONES)[number];

const LADA_REGION: Record<string, Region> = {
  // Noreste (Nuevo León, Tamaulipas, Coahuila)
  "81": "Noreste", "818": "Noreste", "828": "Noreste", "829": "Noreste", "834": "Noreste",
  "841": "Noreste", "844": "Noreste", "861": "Noreste", "867": "Noreste", "871": "Noreste",
  "892": "Noreste", "899": "Noreste",

  // Norte (Chihuahua, Sonora, Baja California, Durango)
  "614": "Norte", "615": "Norte", "616": "Norte", "625": "Norte", "626": "Norte", "627": "Norte",
  "628": "Norte", "629": "Norte", "632": "Norte", "633": "Norte", "636": "Norte", "639": "Norte",
  "649": "Norte", "656": "Norte", "657": "Norte", "662": "Norte", "664": "Norte", "665": "Norte",
  "686": "Norte", "618": "Norte",

  // Bajío (Querétaro, Guanajuato, San Luis Potosí, Aguascalientes)
  "442": "Bajío", "444": "Bajío", "415": "Bajío", "419": "Bajío", "429": "Bajío", "438": "Bajío",
  "456": "Bajío", "461": "Bajío", "462": "Bajío", "464": "Bajío", "466": "Bajío", "468": "Bajío",
  "469": "Bajío", "472": "Bajío", "473": "Bajío", "477": "Bajío", "449": "Bajío",

  // Occidente (Jalisco, Michoacán, Colima, Nayarit)
  "33": "Occidente", "312": "Occidente", "313": "Occidente", "314": "Occidente", "315": "Occidente",
  "316": "Occidente", "317": "Occidente", "322": "Occidente", "341": "Occidente", "342": "Occidente",
  "343": "Occidente", "345": "Occidente", "346": "Occidente", "347": "Occidente", "348": "Occidente",
  "349": "Occidente", "352": "Occidente", "353": "Occidente", "358": "Occidente", "371": "Occidente",
  "375": "Occidente", "376": "Occidente", "377": "Occidente", "378": "Occidente", "392": "Occidente",
  "393": "Occidente", "395": "Occidente", "443": "Occidente", "447": "Occidente", "452": "Occidente",
  "453": "Occidente", "454": "Occidente", "459": "Occidente",

  // Centro (CDMX, Estado de México, Puebla, Morelos, Hidalgo, Tlaxcala)
  "55": "Centro", "56": "Centro", "722": "Centro", "723": "Centro", "724": "Centro", "726": "Centro",
  "728": "Centro", "729": "Centro", "714": "Centro", "716": "Centro", "717": "Centro", "721": "Centro",
  "727": "Centro", "222": "Centro", "223": "Centro", "224": "Centro", "226": "Centro", "227": "Centro",
  "231": "Centro", "233": "Centro", "238": "Centro", "243": "Centro", "244": "Centro", "248": "Centro",
  "249": "Centro", "246": "Centro", "732": "Centro", "734": "Centro", "735": "Centro", "736": "Centro",
  "737": "Centro", "738": "Centro", "739": "Centro", "743": "Centro", "747": "Centro", "751": "Centro",
  "757": "Centro", "758": "Centro", "761": "Centro", "762": "Centro", "763": "Centro", "764": "Centro",
  "766": "Centro", "767": "Centro", "768": "Centro", "769": "Centro", "771": "Centro", "772": "Centro",
  "773": "Centro", "774": "Centro", "775": "Centro", "776": "Centro", "778": "Centro", "779": "Centro",

  // Sureste (Yucatán, Q. Roo, Chiapas, Tabasco, Veracruz, Oaxaca)
  "998": "Sureste", "999": "Sureste", "997": "Sureste", "993": "Sureste", "994": "Sureste",
  "961": "Sureste", "962": "Sureste", "963": "Sureste", "964": "Sureste", "965": "Sureste",
  "966": "Sureste", "967": "Sureste", "968": "Sureste", "992": "Sureste", "983": "Sureste",
  "984": "Sureste", "987": "Sureste", "228": "Sureste", "229": "Sureste", "232": "Sureste",
  "236": "Sureste", "271": "Sureste", "272": "Sureste", "278": "Sureste", "279": "Sureste",
  "281": "Sureste", "283": "Sureste", "284": "Sureste", "286": "Sureste", "288": "Sureste",
  "294": "Sureste", "296": "Sureste", "297": "Sureste", "921": "Sureste", "922": "Sureste",
  "923": "Sureste", "924": "Sureste", "931": "Sureste", "932": "Sureste", "934": "Sureste",
  "938": "Sureste", "951": "Sureste", "954": "Sureste", "958": "Sureste"
};

/** Deriva la macro-región a partir de un teléfono mexicano (LADA de 2 o 3 dígitos). Aproximado. */
export function regionFromTelefono(telefono?: string | null): Region {
  if (!telefono) return "Otra";
  let digits = telefono.replace(/\D/g, "");
  if (digits.startsWith("52") && digits.length > 10) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length < 10) return "Otra";
  const l3 = local.slice(0, 3);
  const l2 = local.slice(0, 2);
  return LADA_REGION[l3] ?? LADA_REGION[l2] ?? "Otra";
}
