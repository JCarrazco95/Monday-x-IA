import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, LineChart, Line
} from "recharts";
import { GraduationCap, RefreshCw, TrendingDown, AlertTriangle, MessageSquareWarning } from "lucide-react";
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
  const tendencia = (data?.tendencia ?? []).map((t) => ({ periodo: t.periodo, score: t.globalProm }));

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

            <Panel title="Radar de habilidades del equipo">
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={habilidades} outerRadius={90}>
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="habilidad" tick={{ fontSize: 11, fill: C.muted }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.muted }} />
                  <Radar dataKey="valor" stroke={C.accent} fill={C.accent} fillOpacity={0.35} />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
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
