// ===========================================================================
//  Referencia de item = identificador de negocio del sistema.
//
//  Formato canónico: `#<itemId> · <itemName>`. La bitácora (`logs.reference`)
//  lo usa como clave para reconstruir leads/llamadas. Antes este parseo estaba
//  DUPLICADO en 6+ archivos; aquí vive una sola vez para que el formato sea
//  consistente y fácil de cambiar.
// ===========================================================================

const REFERENCE_RE = /^#(\S+)\s*·\s*(.+)$/;

/** Construye la referencia canónica a partir de itemId + itemName. */
export function formatReference(itemId: string, itemName: string): string {
  return `#${itemId} · ${itemName}`;
}

/** Parsea `#<itemId> · <itemName>`. Si no matchea, devuelve la referencia cruda en ambos. */
export function parseReference(reference: string): { itemId: string; itemName: string } {
  const m = reference.match(REFERENCE_RE);
  return { itemId: m?.[1] ?? reference, itemName: m?.[2] ?? reference };
}

/** Extrae solo el itemId de una referencia. */
export function itemIdOf(reference: string): string {
  return parseReference(reference).itemId;
}

/** Extrae solo el itemName de una referencia. */
export function itemNameOf(reference: string): string {
  return parseReference(reference).itemName;
}

/** JSON.parse tolerante: devuelve null si el string es vacío o inválido. */
export function safeParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
