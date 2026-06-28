import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { Sparkles, Play, Activity, Bot, Flame, ListChecks } from "lucide-react";
import { api } from "../lib/api";
import type { Agent, LogEntry, LeadSummary, OrchestratorResult } from "../types";
import { KpiCard } from "../components/KpiCard";
import { ActivityFeedItem } from "../components/LogRow";
import { StatusBadge } from "../components/Badge";
import { Link } from "react-router-dom";

const PRIO_COLOR: Record<string, string> = { caliente: "#e2483d", tibia: "#e0922f", fria: "#2e7fd1" };
const PRIO_LABEL: Record<string, string> = { caliente: "Caliente", tibia: "Tibia", fria: "Fría" };

const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25 } };

export function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, l, leadsRes] = await Promise.all([api.getAgents(), api.getLogs({ limit: 10 }), api.getLeads()]);
      setAgents(a);
      setLogs(l);
      setLeads(leadsRes.leads);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSimulation = async (scenario: "form" | "lead" | "call") => {
    setSimulating(scenario);
    try {
      await api.simulate(scenario);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(null);
    }
  };

  const [form, setForm] = useState({ nombre: "", razonSocial: "", rfc: "", email: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<OrchestratorResult | null>(null);

  const analyze = async () => {
    if (!form.razonSocial.trim() && !form.nombre.trim()) {
      setError("Ingresa al menos el nombre de contacto o la razón social.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.analyzeLead(form);
      setResult(res);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="text-text-muted">Cargando...</div>;

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const todayCount = logs.filter((l) => isToday(l.timestamp)).length;
  const totalLeadEvents = agents
    .filter((a) => ["form_analysis", "lead_enrichment", "call_intelligence"].includes(a.id))
    .reduce((sum, a) => sum + a.stats.total, 0);
  const errors24h = agents.reduce((sum, a) => sum + a.stats.errors, 0);

  const prioData = (["caliente", "tibia", "fria"] as const)
    .map((p) => ({ name: PRIO_LABEL[p], key: p, value: leads.filter((l) => l.prioridad === p).length }))
    .filter((d) => d.value > 0);

  const seenNames = new Set<string>();
  const topScore = leads
    .filter((l) => typeof l.score === "number")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .filter((l) => {
      const k = l.itemName.trim().toLowerCase();
      if (seenNames.has(k)) return false;
      seenNames.add(k);
      return true;
    })
    .slice(0, 6)
    .map((l) => ({
      name: l.itemName.length > 16 ? l.itemName.slice(0, 15) + "…" : l.itemName,
      score: l.score as number
    }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-text-muted">Resumen general de la operación de agentes</p>
        </div>
        <div className="flex gap-2">
          <SimButton label="Simular formulario" loading={simulating === "form"} onClick={() => runSimulation("form")} />
          <SimButton label="Simular lead" loading={simulating === "lead"} onClick={() => runSimulation("lead")} />
          <SimButton label="Simular llamada" loading={simulating === "call"} onClick={() => runSimulation("call")} />
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Analizar empresa real */}
      <div className="rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-base font-semibold">Analizar empresa real</h2>
          <span className="text-xs text-text-muted">— la IA investiga la empresa por su razón social</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Contacto" value={form.nombre} placeholder="Ej. Juan García" onChange={(v) => setForm((f) => ({ ...f, nombre: v }))} />
          <Field label="Razón social" value={form.razonSocial} placeholder="Ej. Cementos Mexicanos SAB de CV" onChange={(v) => setForm((f) => ({ ...f, razonSocial: v }))} />
          <Field label="RFC (opcional)" value={form.rfc} placeholder="Ej. CMX950101AB9" onChange={(v) => setForm((f) => ({ ...f, rfc: v }))} />
          <Field label="Email (opcional)" value={form.email} placeholder="contacto@empresa.com" onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={analyze} disabled={analyzing} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50">
            <Sparkles size={15} /> {analyzing ? "Analizando con IA…" : "Analizar empresa"}
          </button>
          {analyzing && <span className="text-xs text-text-muted">Investigando en la web, puede tardar unos segundos…</span>}
        </div>
        {result && <ResultCard result={result} />}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Agentes activos" value={`${activeAgents} / ${agents.length}`} accent="success" />
        <KpiCard label="Eventos hoy" value={todayCount} accent="info" />
        <KpiCard label="Eventos de leads (total)" value={totalLeadEvents} />
        <KpiCard label="Errores acumulados" value={errors24h} accent={errors24h > 0 ? "danger" : undefined} />
      </div>

      {/* Gráficas */}
      <motion.div {...fade} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Flame size={16} className="text-danger" />
            <h2 className="text-base font-semibold">Distribución por prioridad</h2>
          </div>
          {prioData.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">Aún no hay leads priorizados.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div style={{ width: 180, height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={prioData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                      {prioData.map((d) => <Cell key={d.key} fill={PRIO_COLOR[d.key]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2">
                {prioData.map((d) => (
                  <div key={d.key} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-sm" style={{ background: PRIO_COLOR[d.key] }} />
                    <span className="text-text-muted">{d.name}</span>
                    <span className="ml-auto font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity size={16} className="text-accent" />
            <h2 className="text-base font-semibold">Top leads por score</h2>
          </div>
          {topScore.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">Aún no hay leads con score.</p>
          ) : (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topScore} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" interval={0} tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip cursor={{ fill: "rgba(20,98,180,0.06)" }} />
                  <Bar dataKey="score" fill="#1462b4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </motion.div>

      {/* Actividad + agentes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2"><ListChecks size={16} className="text-accent" /><h2 className="text-base font-semibold">Actividad reciente</h2></div>
            <Link to="/logs" className="text-xs text-accent hover:underline">Ver bitácora completa →</Link>
          </div>
          <div className="flex flex-col">
            {logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">Sin actividad todavía.</p>
            ) : (
              logs.map((log) => <ActivityFeedItem key={log.id} log={log} />)
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2"><Bot size={16} className="text-accent" /><h2 className="text-base font-semibold">Estado de agentes</h2></div>
            <Link to="/agents" className="text-xs text-accent hover:underline">Administrar →</Link>
          </div>
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <Link key={agent.id} to={`/agents/${agent.id}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-black/[0.03]">
                <div>
                  <div className="text-sm font-medium">{agent.name}</div>
                  <div className="text-xs text-text-muted">{agent.role}</div>
                </div>
                <StatusBadge status={agent.status} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent" />
    </label>
  );
}

function ResultCard({ result }: { result: OrchestratorResult }) {
  if (result.skipped) {
    return (
      <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
        Análisis omitido{result.reason ? `: ${result.reason}` : " (agente pausado)."}
      </div>
    );
  }
  const cols = (result.writeInput?.columnUpdates ?? {}) as Record<string, unknown>;
  const score = cols.score_lead as number | undefined;
  const prioridad = cols.prioridad as string | undefined;
  const riesgo = cols.riesgo as string | undefined;
  const perfil = cols.perfil_empresa as string | undefined;
  const sectores = cols.sectores as string | undefined;
  const accion = cols.accion_recomendada as string | undefined;
  const scoreCol = score == null ? "text-text" : score >= 75 ? "text-success" : score >= 50 ? "text-warning" : "text-danger";

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${scoreCol}`}>{score ?? "—"}</span>
          <span className="text-sm text-text-muted">/100</span>
        </div>
        {prioridad && <Tag>{prioridad}</Tag>}
        {riesgo && <Tag>Riesgo {riesgo}</Tag>}
        {sectores && <span className="text-xs text-text-muted">Sector: {sectores}</span>}
      </div>
      {perfil && <p className="mt-2 text-sm text-text-muted">{perfil}</p>}
      {accion && <p className="mt-2 text-sm"><span className="font-semibold text-accent">⚡ Acción: </span>{accion}</p>}
      <p className="mt-2 text-xs text-text-muted">Resultado guardado · ábrelo en la pestaña Análisis IA para el detalle completo.</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-accent">{children}</span>;
}

function SimButton({ label, onClick, loading }: { label: string; onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50">
      <Play size={14} /> {loading ? "Ejecutando..." : label}
    </button>
  );
}

function isToday(ts: string) {
  const normalized = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
}
