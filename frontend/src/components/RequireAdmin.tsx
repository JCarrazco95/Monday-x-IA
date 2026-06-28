import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useRole } from "../lib/useRole";

// ===========================================================================
//  Guard de ruta: solo administradores. Mientras se resuelve el rol muestra
//  un estado de carga; a los vendedores los redirige a "Análisis IA".
// ===========================================================================

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-text-muted">
        Verificando permisos…
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/leads" replace />;
  }

  return <>{children}</>;
}
