import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMondayUser, type MondayUser, type UserRole } from "./mondaySDK";

// ===========================================================================
//  Contexto de rol — resuelve una sola vez el rol del usuario de Monday y lo
//  comparte con el Layout (pestañas visibles) y los guards de ruta.
// ===========================================================================

interface RoleState {
  user: MondayUser | null;
  loading: boolean;
  isAdmin: boolean;
  role: UserRole;
}

const RoleContext = createContext<RoleState>({
  user: null,
  loading: true,
  isAdmin: false,
  role: "sales"
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MondayUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getMondayUser()
      .then((u) => active && setUser(u))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <RoleContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.isAdmin ?? false,
        role: user?.role ?? "sales"
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleState {
  return useContext(RoleContext);
}
