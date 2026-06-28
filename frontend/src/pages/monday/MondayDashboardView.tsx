import { useEffect, useState, useCallback } from "react";
import { RefreshCw, TrendingUp, Flame, ListChecks, GraduationCap, Sparkles, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import type { LeadsResponse, ForecastReport, CoachingReport, NextBestActionReport } from "../../types";

// ===========================================================================
//  Dashboard Widget para Monday.com — panel ejecutivo embebido.
//  Se registra como feature "Dashboard Widget" en el Monday Developer Center
//  apuntando a {URL}/monday/dashboard. Agrega leads + pipeline + coaching + NBA.
// ===========================================================================

function money(n: number, moneda = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(n);
}

const ETAPA_COLOR: Record<string, string> = {
  "Calificado": "#2e7fd1", "Cotización": "#1462b4", "Negociación": "#e0922f", "Cierre probable": "#1fa971"
};

function Kpi({ label, value, color, icon }: { label: string; value: React.ReactNode; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">{icon}{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? "text-text"}`}>{value}</p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">{icon}{title}</h3>
      {children}
    </div>
  );
}

export function MondayDashboardView() {
  const [leads, setLeads] = useState<LeadsResponse | null>(null);
  const [forecast, setForecast] = useState<ForecastReport | null>(null);
  const [coaching, setCoaching] = useState<CoachingReport | null>(null);
  const [nba, setNba] = useState<NextBestActionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, f, c, n] = await Promise.all([
        api.getLeads(), api.getForecast(), api.getCoaching(), api.getNextBestActions()
      ]);
      setLeads(l); setForecast(f); setCoaching(c); setNba(n);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const moneda = forecast?.supuestos.moneda ?? "MXN";
  const maxFunnel = Math.max(1, ...(forecast?.funnel ?? []).map((f) => f.valor));
  const maxMes = Math.max(1, ...(forecast?.porMes ?? []).map((m) => m.valorPonderado));

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">M</div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Panel ejecutivo · MAXIRent IA</h1>
          <p className="text-xs text-text-muted">Resumen comercial para Monday Dashboard (leads, pipeline, coaching y seguimiento)</p>
        </div>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="px-6 py-5">
        {error && <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>}

        {loading ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">Cargando panel…</div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Leads analizados" value={leads?.stats.total ?? "—"} icon={<Sparkles size={12} />} />
              <Kpi label="Pipeline ponderado" value={forecast ? money(forecast.stats.valorPonderado, moneda) : "—"} color="text-success" icon={<TrendingUp size={12} />} />
              <Kpi label="Llamadas analizadas" value={coaching?.stats.totalLlamadas ?? "—"} icon={<GraduationCap size={12} />} />
              <Kpi label="Seguimiento (alta)" value={nba?.porPrioridad.alta ?? "—"} color="text-danger" icon={<ListChecks size={12} />} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Pipeline por mes (ponderado)" icon={<TrendingUp size={15} className="text-accent" />}>
                {(forecast?.porMes ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">Sin datos de pipeline.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {forecast!.porMes.map((m) => (
                      <div key={m.mes}>
                        <div className="mb-1 flex justify-between text-[12px]"><span className="text-text">{m.mes} <span className="text-text-muted">({m.count})</span></span><span className="font-semibold">{money(m.valorPonderado, moneda)}</span></div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-accent" style={{ width: `${(m.valorPonderado / maxMes) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Funnel del pipeline" icon={<TrendingUp size={15} className="text-accent" />}>
                <div className="flex flex-col gap-2.5">
                  {(forecast?.funnel ?? []).map((f) => (
                    <div key={f.etapa}>
                      <div className="mb-1 flex justify-between text-[12px]"><span className="text-text">{f.etapa} <span className="text-text-muted">({f.count})</span></span><span className="text-text-muted">{money(f.valorPonderado, moneda)}</span></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full" style={{ width: `${(f.valor / maxFunnel) * 100}%`, background: ETAPA_COLOR[f.etapa] ?? "#1462b4" }} /></div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Foco de coaching del equipo" icon={<GraduationCap size={15} className="text-accent" />}>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border p-2"><p className="text-[10px] text-text-muted">Sandler</p><p className="text-lg font-bold">{coaching?.stats.sandlerProm ?? "—"}</p></div>
                  <div className="rounded-lg border border-border p-2"><p className="text-[10px] text-text-muted">Challenger</p><p className="text-lg font-bold">{coaching?.stats.challengerProm ?? "—"}</p></div>
                  <div className="rounded-lg border border-border p-2"><p className="text-[10px] text-text-muted">Global</p><p className="text-lg font-bold">{coaching?.stats.globalProm ?? "—"}</p></div>
                </div>
                {coaching?.etapaMasDebil && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[12px]">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                    <span>Etapa más débil: <strong>{coaching.etapaMasDebil.nombre}</strong> ({coaching.etapaMasDebil.promedio}/100)</span>
                  </div>
                )}
              </Panel>

              <Panel title="Alertas de seguimiento (alta prioridad)" icon={<ListChecks size={15} className="text-accent" />}>
                {(nba?.acciones.filter((a) => a.prioridad === "alta") ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">Sin alertas de alta prioridad. 🎉</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {nba!.acciones.filter((a) => a.prioridad === "alta").slice(0, 5).map((a, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/[0.04] p-2.5 text-[12px]">
                        <Flame size={14} className="mt-0.5 shrink-0 text-danger" />
                        <span><strong>{a.itemName}</strong> — {a.motivo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
