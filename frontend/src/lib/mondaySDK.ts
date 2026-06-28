// Wrapper para el monday-sdk-js.
// Cuando la vista corre dentro de un iframe de Monday.com, el SDK provee contexto real.
// En desarrollo, usa URL params (?itemId=xxx) o devuelve null.

export interface MondayContext {
  boardId?: string;
  itemId?: string;
  theme?: "light" | "dark" | "black";
}

let _sdk: ReturnType<typeof import("monday-sdk-js")["default"]> | null = null;

async function getSdk() {
  if (_sdk) return _sdk;
  try {
    const mod = await import("monday-sdk-js");
    const factory = mod.default ?? (mod as unknown as { default: typeof mod.default }).default;
    _sdk = factory();
    return _sdk;
  } catch {
    return null;
  }
}

export async function getMondayContext(): Promise<MondayContext | null> {
  // 1. Try SDK context (real Monday iframe)
  try {
    const sdk = await getSdk();
    if (sdk) {
      const res = await sdk.get("context");
      if (res?.data?.boardId || res?.data?.itemId) {
        return res.data as MondayContext;
      }
    }
  } catch {
    // not in Monday iframe
  }

  // 2. Dev fallback: URL search params
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get("itemId");
  const boardId = params.get("boardId");
  if (itemId || boardId) {
    return { itemId: itemId ?? undefined, boardId: boardId ?? undefined };
  }

  return null;
}

// ─── Rol del usuario (control de acceso a las pestañas) ──────────────────────
//  Vendedores → solo ven Dashboard, Análisis IA y Call Intelligence.
//  Administradores → ven todas las pestañas.
//  El rol se determina con `me { is_admin }` del SDK de Monday. En desarrollo
//  se puede forzar con ?role=admin | ?role=sales en la URL.

export type UserRole = "admin" | "sales";

export interface MondayUser {
  id?: string;
  name?: string;
  email?: string;
  isAdmin: boolean;
  role: UserRole;
  source: "sdk" | "url" | "fallback";
}

export async function getMondayUser(): Promise<MondayUser> {
  // 1. Override de desarrollo: ?role=admin | ?role=sales
  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get("role");
  if (roleParam === "admin" || roleParam === "sales") {
    return {
      isAdmin: roleParam === "admin",
      role: roleParam,
      name: "Usuario de prueba",
      source: "url"
    };
  }

  // 2. SDK real de Monday: consulta is_admin del usuario autenticado
  try {
    const sdk = await getSdk();
    if (sdk) {
      const res = await sdk.api("query { me { id name email is_admin } }");
      const me = (res as { data?: { me?: { id?: string; name?: string; email?: string; is_admin?: boolean } } })
        ?.data?.me;
      if (me) {
        const isAdmin = Boolean(me.is_admin);
        return {
          id: me.id,
          name: me.name,
          email: me.email,
          isAdmin,
          role: isAdmin ? "admin" : "sales",
          source: "sdk"
        };
      }
    }
  } catch {
    // fuera del iframe de Monday o sin permisos → usar fallback
  }

  // 3. Fallback de mínimo privilegio: tratar como vendedor
  return { isAdmin: false, role: "sales", source: "fallback" };
}

export async function setMondayTheme() {
  try {
    const sdk = await getSdk();
    sdk?.execute("valueCreatedForUser");
  } catch {
    // ignore
  }
}
