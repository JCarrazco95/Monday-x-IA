import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { LayoutDashboard, Bot, Sparkles, Phone, ListChecks, TrendingUp, GraduationCap, MessageSquare, ScrollText, Settings, type LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useRole } from "../lib/useRole";
import { Logo } from "./Logo";
import type { HealthResponse } from "../types";

const navItems: { to: string; label: string; icon: LucideIcon; end?: boolean; adminOnly: boolean }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, adminOnly: false },
  { to: "/agents", label: "Agentes", icon: Bot, adminOnly: true },
  { to: "/leads", label: "Análisis IA", icon: Sparkles, adminOnly: false },
  { to: "/call-intelligence", label: "Call Intelligence", icon: Phone, adminOnly: false },
  { to: "/seguimiento", label: "Seguimiento", icon: ListChecks, adminOnly: false },
  { to: "/pipeline", label: "Pipeline", icon: TrendingUp, adminOnly: false },
  { to: "/asistente", label: "Asistente", icon: MessageSquare, adminOnly: false },
  { to: "/coaching", label: "Coaching", icon: GraduationCap, adminOnly: true },
  { to: "/logs", label: "Bitácora", icon: ScrollText, adminOnly: true },
  { to: "/settings", label: "Configuración", icon: Settings, adminOnly: true }
];

function setRoleParam(role: "admin" | "sales") {
  const u = new URL(window.location.href);
  u.searchParams.set("role", role);
  window.location.assign(u.toString());
}

export function Layout() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const { isAdmin, loading: roleLoading, user } = useRole();
  const location = useLocation();

  const visibleNav = navItems.filter((item) => isAdmin || !item.adminOnly);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const aiLabel = health?.aiProvider
    ? health.aiProvider === "gemini" ? "Gemini" : health.aiProvider === "claude" ? "Claude" : "Demo"
    : health?.claudeMode === "live" ? "LIVE" : "DEMO";

  return (
    <div className="flex min-h-screen bg-bg text-text">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6">
        <div className="mb-6 px-2">
          <Logo className="h-9 w-auto" />
          <div className="mt-1.5 text-xs text-text-muted">Agentes IA · Monday</div>
        </div>

        {/* Rol del usuario (selector de demo) */}
        <div className="mb-3 rounded-lg border border-border bg-bg px-3 py-2 text-xs">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-text-muted">Rol</span>
            {roleLoading ? (
              <span className="text-text-muted">…</span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isAdmin ? "bg-accent/15 text-accent" : "bg-info/15 text-info"}`}
                title={user?.email ?? user?.name ?? undefined}
              >
                {isAdmin ? "Administrador" : "Vendedor"}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setRoleParam("admin")}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${isAdmin ? "bg-accent text-white" : "border border-border text-text-muted hover:text-text"}`}
            >
              Admin
            </button>
            <button
              onClick={() => setRoleParam("sales")}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${!isAdmin ? "bg-info text-white" : "border border-border text-text-muted hover:text-text"}`}
            >
              Vendedor
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-text-muted">Demo: en producción el rol lo define Monday.</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-accent/15 text-accent" : "text-text-muted hover:bg-black/5 hover:text-text"
                  }`
                }
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-border bg-bg px-3 py-2.5 text-xs">
          {health ? (
            <>
              <div className="mb-1.5 flex items-center gap-2 font-medium text-success">
                <span className="h-2 w-2 rounded-full bg-success" />
                Sistema operando
              </div>
              <div className="flex justify-between text-text-muted">
                <span>IA</span>
                <span className={health.claudeMode === "live" ? "text-success" : "text-warning"}>{aiLabel}</span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Monday</span>
                <span className={health.mondayMode === "live" ? "text-success" : "text-warning"}>
                  {health.mondayMode === "live" ? "LIVE" : "DEMO"}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 font-medium text-danger">
              <span className="h-2 w-2 rounded-full bg-danger" />
              Backend no disponible
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-6">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
