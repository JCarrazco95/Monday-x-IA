import { Dashboard } from "../Dashboard";

// ===========================================================================
//  Dashboard Widget para Monday.com — embebe el Dashboard operativo completo
//  (el mismo de la app: simular, analizar empresa, KPIs, distribución por
//  prioridad, top leads, actividad reciente y estado de agentes), pero SIN la
//  barra lateral (esa la pone el Layout en la app standalone).
//
//  Se registra como feature "Dashboard Widget" apuntando a {URL}/monday/dashboard.
// ===========================================================================

export function MondayDashboardView() {
  return (
    <div className="min-h-screen bg-bg px-5 py-5 text-text">
      <Dashboard />
    </div>
  );
}
