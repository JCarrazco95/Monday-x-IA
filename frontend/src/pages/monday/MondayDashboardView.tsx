import { Navigate } from "react-router-dom";

// ===========================================================================
//  Dashboard Widget para Monday.com.
//
//  Se registra como feature "Dashboard Widget" apuntando a {URL}/monday/dashboard.
//  Redirige a la app completa (Layout + barra lateral + navegación) para que el
//  equipo use TODAS las vistas (Dashboard, Análisis IA, Pipeline, Coaching, etc.)
//  desde el dashboard de Monday. El rol (admin/vendedor) lo resuelve el SDK de
//  Monday dentro del iframe.
// ===========================================================================

export function MondayDashboardView() {
  return <Navigate to="/" replace />;
}
