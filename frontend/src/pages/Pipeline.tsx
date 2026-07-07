import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { TrendingUp, RefreshCw, Info, DollarSign, Users, Database } from "lucide-react";
import { api } from "../lib/api";
import type { ForecastReport } from "../types";

// ===========================================================================
//  Pipeline / Forecast — pipeline ponderado por probabilidad.
//  Lee /api/forecast. `fuente: "monday"` = montos y etapas reales del board de
//  Oportunidades; `fuente: "estimado"` = heurística de demo. Los valores se
//  muestran SIEMPRE con sus supuestos.
// ===========================================================================

const ETAPA_COLOR: Record<string, string> = {
  // Etapas reales del board de Oportunidades (modo Monday).
  "Requiere seguimiento": "#e0922f",
  "Cotización enviada": "#2e7fd1",
  "Negociando": "#1462b4",
  "Documentación": "#1fa971",
  "Sin etapa": "#64748b",
  // Etapas estimadas (modo demo).
  "Calificado": "#2e7fd1",
  "Cotización": "#1462b4",
  "Negociación": "#e0922f",
  "Cierre probable": "#1fa971"
};
const PRIO_CHIP: Record<string, string> = {
  caliente: "bg-danger/15 text-danger", tibia: "bg-warning/15 text-warning", fria: "bg-info/15 text-info"
};
const FUENTE_PROB_LABEL: Record<string, string> = {
  llamada: "llam.", lead: "lead", default: "def.", etapa: "etapa"
};

function money(n: number, moneda = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(n);
}
function moneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function StatCard({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color ?? "text-text"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

export function Pipeline() {
  const [data, setData] = useState<ForecastReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getForecast());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const moneda = data?.supuestos.moneda ?? "MXN";
  const esMonday = data?.fuente === "monday";
  const hayObjetivo = (data?.porMes ?? []).some((m) => m.objetivo != null);
  const mesData = (data?.porMes ?? []).map((m) => ({
    mes: m.mes, ponderado: m.valorPonderado, bruto: m.valorBruto, count: m.count, objetivo: m.objetivo
  }));
  const maxFunnel = Math.max(1, ...(data?.funnel ?? []).map((f) => f.valor));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            <TrendingUp className="text-accent" /> Pipeline & Forecast
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-text-muted">
            Pipeline ponderado por probabilidad de cierre y proyección de ingresos.
            {data && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  esMonday ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                }`}
              >
                <Database size={11} /> {esMonday ? "Datos reales de Monday" : "Estimación (demo)"}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-text-muted">Calculando pipeline…</div>
      ) : !data || data.stats.totalOportunidades === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center text-sm text-text-muted">
          Aún no hay oportunidades en el pipeline. Analiza leads y llamadas para proyectar ingresos.
        </div>
      ) : (
        <>
          <div className={`mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 ${esMonday ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
            <StatCard label="Pipeline ponderado" value={money(data.stats.valorPonderado, moneda)} color="text-success" sub="esperado (prob × valor)" />
            <StatCard label="Pipeline bruto" value={money(data.stats.valorPipeline, moneda)} sub="si todo cierra" />
            <StatCard
              label="Oportunidades"
              value={data.stats.totalOportunidades}
              sub={data.stats.sinMonto > 0 ? `${data.stats.sinMonto} sin monto` : undefined}
            />
            <StatCard label="Ticket promedio" value={money(data.stats.ticketPromedio, moneda)} sub="por oportunidad" />
            <StatCard label="Prob. promedio" value={`${data.stats.probPromedio}%`} />
            {esMonday && data.stats.ganadoAnio != null && (
              <StatCard
                label="Ganado (año)"
                value={money(data.stats.ganadoAnio, moneda)}
                color="text-success"
                sub={data.stats.ganadoMes != null ? `este mes: ${money(data.stats.ganadoMes, moneda)}` : undefined}
              />
            )}
          </div>

          <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/25 bg-info/[0.06] px-4 py-2.5 text-xs text-text-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-info" />
            <span>
              <strong className="text-text">Supuestos:</strong> {data.supuestos.nota}
              {data.supuestos.ticketBase != null && <> Ticket base: {money(data.supuestos.ticketBase, moneda)}/mes.</>}
              {esMonday && !data.objetivos.disponible && data.objetivos.motivo && (
                <> <strong className="text-text">Objetivos:</strong> {data.objetivos.motivo}</>
              )}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text"><DollarSign size={15} className="text-accent" /> Proyección de ingresos por mes (ponderada)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={mesData} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tickFormatter={moneyShort} tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
                  <Tooltip formatter={(v) => money(Number(v) || 0, moneda)} />
                  {hayObjetivo && <Legend wrapperStyle={{ fontSize: 12 }} />}
                  <Bar dataKey="ponderado" name="Esperado" radius={[4, 4, 0, 0]} fill="#1462b4" />
                  {hayObjetivo && <Bar dataKey="objetivo" name="Objetivo" radius={[4, 4, 0, 0]} fill="#1fa971" />}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-text">Funnel del pipeline</h3>
              <div className="flex flex-col gap-3 pt-2">
                {data.funnel.map((f) => (
                  <div key={f.etapa}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="font-medium text-text">{f.etapa} <span className="text-text-muted">({f.count})</span></span>
                      <span className="text-text-muted">{money(f.valor, moneda)} · pond. <span className="font-semibold text-text">{money(f.valorPonderado, moneda)}</span></span>
                    </div>
                    <div className="h-5 overflow-hidden rounded-md bg-black/[0.06]">
                      <div className="h-full rounded-md transition-all" style={{ width: `${(f.valor / maxFunnel) * 100}%`, background: ETAPA_COLOR[f.etapa] ?? "#1462b4" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {data.porEjecutivo.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-surface">
              <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-text">
                <Users size={15} className="text-accent" /> Pipeline por ejecutivo
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-muted">
                      <th className="px-4 py-2 font-medium">Ejecutivo</th>
                      <th className="px-4 py-2 text-right font-medium">Oportunidades</th>
                      <th className="px-4 py-2 text-right font-medium">Pipeline bruto</th>
                      <th className="px-4 py-2 text-right font-medium">Ponderado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porEjecutivo.map((e) => (
                      <tr key={e.ejecutivo} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2 font-medium text-text">{e.ejecutivo}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{e.count}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-muted">{money(e.valor, moneda)}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-text">{money(e.valorPonderado, moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-text">Top oportunidades (por valor ponderado)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium">Oportunidad</th>
                    {esMonday && <th className="px-4 py-2 font-medium">Empresa</th>}
                    {esMonday && <th className="px-4 py-2 font-medium">Ejecutivo</th>}
                    <th className="px-4 py-2 font-medium">Etapa</th>
                    {!esMonday && <th className="px-4 py-2 font-medium">Prioridad</th>}
                    <th className="px-4 py-2 text-right font-medium">Prob.</th>
                    <th className="px-4 py-2 text-right font-medium">Valor{esMonday ? "" : " est."}</th>
                    <th className="px-4 py-2 text-right font-medium">Ponderado</th>
                    <th className="px-4 py-2 font-medium">Cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topOportunidades.map((o) => (
                    <tr key={o.itemId} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-medium text-text">{o.itemName}</td>
                      {esMonday && <td className="px-4 py-2 text-text-muted">{o.empresa ?? "—"}</td>}
                      {esMonday && <td className="px-4 py-2 text-text-muted">{o.ejecutivo ?? "—"}</td>}
                      <td className="px-4 py-2"><span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: (ETAPA_COLOR[o.etapa] ?? "#1462b4") + "22", color: ETAPA_COLOR[o.etapa] ?? "#1462b4" }}>{o.etapa}</span></td>
                      {!esMonday && (
                        <td className="px-4 py-2">{o.prioridad ? <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${PRIO_CHIP[o.prioridad]}`}>{o.prioridad}</span> : "—"}</td>
                      )}
                      <td className="px-4 py-2 text-right tabular-nums">{o.probabilidad}% <span className="text-[10px] text-text-muted">({FUENTE_PROB_LABEL[o.probabilidadFuente] ?? o.probabilidadFuente})</span></td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">{o.sinMonto ? "sin monto" : money(o.valorEstimado, moneda)}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-text">{o.sinMonto ? "—" : money(o.valorPonderado, moneda)}</td>
                      <td className="px-4 py-2 text-text-muted">{o.mesCierre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
