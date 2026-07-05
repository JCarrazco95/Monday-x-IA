import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  PieChart, Pie, LineChart, Line
} from "recharts";
import { GraduationCap, RefreshCw, TrendingDown, AlertTriangle, MessageSquareWarning, Users, FileText, Copy, Check } from "lucide-react";
import { api } from "../lib/api";
import type { CoachingReport } from "../types";

// ===========================================================================
//  Coaching del equipo — convierte el análisis de llamadas en mejora de ventas.
//  Lee /api/coaching (agregación a nivel equipo).
// ===========================================================================

const C = {
  accent: "#1462b4", success: "#1fa971", warning: "#e0922f", danger: "#e2483d",
  info: "#2e7fd1", muted: "#64748b", border: "#e2e8f0"
};
const PIE_COLORS = [C.accent, C.info, C.warning, C.success, C.danger, C.muted];

const PERFIL_LABEL: Record<string, string> = {
  challenger: "Challenger", hard_worker: "Trabajador", lone_wolf: "Lobo solitario",
  relationship_builder: "Relacional", reactive_problem_solver: "Reactivo"
};

function colorForScore(s: number): string {
  return s >= 75 ? C.success : s >= 50 ? C.warning : C.danger;
}

function StatCard({ label, value, color, sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${color ?? "text-text"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">{icon}{title}</h3>
      {children}
    </div>
  );
}

function FreqList({ items, color }: { items: { texto: string; count: number }[]; color: string }) {
  if (!items.length) return <div className="py-6 text-center text-sm text-text-muted">Sin datos aún.</div>;
  const max = items[0].count;
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-text">{it.texto}</span>
            <span className="shrink-0 font-semibold text-text-muted">×{it.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full" style={{ width: `${(it.count / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Coaching() {
  const [data, setData] = useState<CoachingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // C.2: tendencia por vendedor ("" = todo el equipo).
  const [trendVendedor, setTrendVendedor] = useState("");
  // C.7: reporte ejecutivo bajo demanda.
  const [reporte, setReporte] = useState<string | null>(null);
  const [reporteDias, setReporteDias] = useState(7);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const generarReporte = async () => {
    setGenerando(true);
    try {
      const r = await api.getExecutiveReport(reporteDias);
      setReporte(r.markdown);
      setCopiado(false);
    } catch (err) {
      setReporte(`Error al generar el reporte: ${err instanceof Error ? err.message : err}`);
    } finally {
      setGenerando(false);
    }
  };

  const copiarReporte = async () => {
    if (!reporte) return;
    await navigator.clipboard.writeText(reporte);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getCoaching());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const etapas = (data?.etapasSandler ?? []).map((e) => ({
    nombre: e.nombre.replace(/\s*\(.*\)/, ""), promedio: e.promedio, esDebil: e.id === data?.etapaMasDebil?.id
  }));
  const habilidades = (data?.habilidades ?? []).map((h) => ({ habilidad: h.nombre.replace(/\s*\/.*/, ""), valor: h.promedio }));
  const perfiles = (data?.perfilesVendedor ?? []).map((p) => ({ name: PERFIL_LABEL[p.perfil] ?? p.perfil, value: p.count }));
  // Serie de tendencia: equipo completo o el vendedor seleccionado (C.2).
  const trendSource = trendVendedor
    ? (data?.porVendedor ?? []).find((v) => v.vendedor === trendVendedor)?.tendencia ?? []
    : data?.tendencia ?? [];
  const tendencia = trendSource.map((t) => ({ periodo: t.periodo, score: t.globalProm }));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            <GraduationCap className="text-accent" /> Coaching del equipo
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            De analizar llamadas a mejorar al equipo: dónde se cae la venta y qué entrenar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={reporteDias}
            onChange={(e) => setReporteDias(Number(e.target.value))}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-muted focus:outline-none"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={14}>Últimos 14 días</option>
            <option value={30}>Últimos 30 días</option>
          </select>
          <button
            onClick={generarReporte}
            disabled={generando}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <FileText size={15} className={generando ? "animate-pulse" : ""} /> Reporte ejecutivo
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>
      </div>

      {reporte && (
        <div className="mb-4 rounded-xl border border-accent/25 bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <FileText size={15} className="text-accent" /> Reporte ejecutivo (listo para enviar)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={copiarReporte}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text"
              >
                {copiado ? <Check size={13} className="text-success" /> : <Copy size={13} />} {copiado ? "Copiado" : "Copiar"}
              </button>
              <button onClick={() => setReporte(null)} className="text-xs text-text-muted hover:text-text">Cerrar</button>
            </div>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs leading-relaxed text-text">{reporte}</pre>
        </div>
      )}

      {error && <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-text-muted">Calculando métricas del equipo…</div>
      ) : !data || data.stats.totalLlamadas === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center text-sm text-text-muted">
          Aún no hay llamadas analizadas. Simula o ingesta llamadas para ver el coaching del equipo.
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Llamadas" value={data.stats.totalLlamadas} />
            <StatCard label="Sandler" value={data.stats.sandlerProm} sub="promedio" />
            <StatCard label="Challenger" value={data.stats.challengerProm} sub="promedio" />
            <StatCard label="Global" value={data.stats.globalProm} sub="promedio" />
            <StatCard label="Verdes" value={data.stats.verdes} color="text-success" />
            <StatCard label="Rojas" value={data.stats.rojas} color="text-danger" />
          </div>

          {data.etapaMasDebil && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <TrendingDown className="shrink-0 text-warning" size={18} />
              <span className="text-text">
                Foco de coaching del equipo: la etapa Sandler más débil es{" "}
                <strong>{data.etapaMasDebil.nombre}</strong> (promedio {data.etapaMasDebil.promedio}/100). Entrenar aquí mueve la aguja.
              </span>
            </div>
          )}

          {(data.porVendedor ?? []).length > 0 && (
            <div className="mb-4">
              <Panel title="Desempeño por vendedor" icon={<Users size={15} className="text-accent" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-text-muted">
                        <th className="px-3 py-2 font-medium">Vendedor</th>
                        <th className="px-3 py-2 text-right font-medium">Llamadas</th>
                        <th className="px-3 py-2 text-right font-medium">Sandler</th>
                        <th className="px-3 py-2 text-right font-medium">Challenger</th>
                        <th className="px-3 py-2 text-right font-medium">Global</th>
                        <th className="px-3 py-2 font-medium">Etapa a entrenar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.porVendedor ?? []).map((v) => (
                        <tr key={v.vendedor} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2 font-medium text-text">{v.vendedor}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-text-muted">{v.llamadas}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: colorForScore(v.sandlerProm) }}>{v.sandlerProm}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: colorForScore(v.challengerProm) }}>{v.challengerProm}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: colorForScore(v.globalProm) }}>{v.globalProm}</td>
                          <td className="px-3 py-2 text-text-muted">{v.etapaMasDebil ? `${v.etapaMasDebil.nombre} (${v.etapaMasDebil.promedio})` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Desempeño por etapa Sandler (equipo)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={etapas} margin={{ top: 8, right: 8, bottom: 40, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="nombre" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: C.muted }} height={60} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip />
                  <Bar dataKey="promedio" radius={[4, 4, 0, 0]}>
                    {etapas.map((e, i) => (
                      <Cell key={i} fill={e.esDebil ? C.danger : colorForScore(e.promedio)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Habilidades del equipo (promedio)">
              {habilidades.length === 0 ? (
                <div className="py-6 text-center text-sm text-text-muted">Sin datos aún.</div>
              ) : (
                <ul className="space-y-2.5 py-1">
                  {habilidades.map((h) => (
                    <li key={h.habilidad}>
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-text">{h.habilidad}</span>
                        <span className="font-semibold" style={{ color: colorForScore(h.valor) }}>{h.valor}/100</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
                        <div className="h-full rounded-full" style={{ width: `${h.valor}%`, background: colorForScore(h.valor) }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Perfil del vendedor (Challenger)">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={perfiles} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name} (${e.value})`}>
                    {perfiles.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Tendencia del score global (mensual)">
              {(data.porVendedor ?? []).length > 0 && (
                <select
                  value={trendVendedor}
                  onChange={(e) => setTrendVendedor(e.target.value)}
                  className="mb-2 h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Todo el equipo</option>
                  {(data.porVendedor ?? []).map((v) => (
                    <option key={v.vendedor} value={v.vendedor}>{v.vendedor}</option>
                  ))}
                </select>
              )}
              {tendencia.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={tendencia} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke={C.accent} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[240px] items-center justify-center text-center text-sm text-text-muted">
                  Se necesita más de un mes de llamadas para mostrar la tendencia.
                </div>
              )}
            </Panel>

            <Panel title="Banderas rojas recurrentes" icon={<AlertTriangle size={15} className="text-danger" />}>
              <FreqList items={data.banderasRojas} color={C.danger} />
            </Panel>

            <Panel title="Objeciones más comunes" icon={<MessageSquareWarning size={15} className="text-warning" />}>
              <FreqList items={data.objeciones} color={C.warning} />
            </Panel>
          </div>

          {data.areasMejora.length > 0 && (
            <div className="mt-4">
              <Panel title="Áreas de mejora recurrentes del equipo">
                <FreqList items={data.areasMejora} color={C.accent} />
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}
