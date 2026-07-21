import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { TrendingUp, RefreshCw, Info, DollarSign, Users, Database, ExternalLink, FileText } from "lucide-react";
import { api } from "../lib/api";
import type { ForecastReport, ForecastCerradasReport } from "../types";

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
  "Ganado": "#1fa971",
  "Perdido": "#dc4c4c",
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
  const [vista, setVista] = useState<"abierto" | "cerradas">("abierto");

  const [data, setData] = useState<ForecastReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtros de la tabla completa (modo Monday).
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [buscar, setBuscar] = useState("");

  // Vista 2: ganadas/perdidas (histórico de cierres reales, solo modo Monday).
  const [cerradas, setCerradas] = useState<ForecastCerradasReport | null>(null);
  const [loadingCerradas, setLoadingCerradas] = useState(false);
  const [errorCerradas, setErrorCerradas] = useState<string | null>(null);
  const [filtroGrupoC, setFiltroGrupoC] = useState("");
  const [buscarC, setBuscarC] = useState("");
  const [filtroEtapaC, setFiltroEtapaC] = useState<"" | "Ganado" | "Perdido">("");
  const [filtroMotivoC, setFiltroMotivoC] = useState("");

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

  const loadCerradas = useCallback(async () => {
    setLoadingCerradas(true);
    try {
      setCerradas(await api.getForecastCerradas());
      setErrorCerradas(null);
    } catch (err) {
      setErrorCerradas(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingCerradas(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Carga perezosa: la vista de cerradas solo pide datos la primera vez que se abre.
  useEffect(() => {
    if (vista === "cerradas" && !cerradas && !loadingCerradas) loadCerradas();
  }, [vista, cerradas, loadingCerradas, loadCerradas]);

  const moneda = data?.supuestos.moneda ?? "MXN";
  const esMonday = data?.fuente === "monday";
  const hayObjetivo = (data?.porMes ?? []).some((m) => m.objetivo != null);
  const mesData = (data?.porMes ?? []).map((m) => ({
    mes: m.mes, ponderado: m.valorPonderado, bruto: m.valorBruto, count: m.count, objetivo: m.objetivo
  }));
  const maxFunnel = Math.max(1, ...(data?.funnel ?? []).map((f) => f.valor));

  // Tabla: en modo Monday, TODAS las oportunidades con filtros; en demo, el top.
  const filtradas = useMemo(() => {
    const base = esMonday ? (data?.oportunidades ?? data?.topOportunidades ?? []) : (data?.topOportunidades ?? []);
    const q = buscar.trim().toLowerCase();
    return base.filter((o) => {
      if (filtroGrupo && o.grupo !== filtroGrupo) return false;
      if (!q) return true;
      return (
        o.itemName.toLowerCase().includes(q) ||
        (o.empresa ?? "").toLowerCase().includes(q) ||
        (o.ejecutivo ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, esMonday, filtroGrupo, buscar]);

  const filtradasC = useMemo(() => {
    const base = cerradas?.oportunidades ?? [];
    const q = buscarC.trim().toLowerCase();
    return base.filter((o) => {
      if (filtroGrupoC && o.grupo !== filtroGrupoC) return false;
      if (filtroEtapaC && o.etapa !== filtroEtapaC) return false;
      // El dropdown de Monday puede traer varios motivos separados por coma.
      if (filtroMotivoC && !(o.motivoPerdida ?? "").split(",").map((s) => s.trim()).includes(filtroMotivoC)) return false;
      if (!q) return true;
      return (
        o.itemName.toLowerCase().includes(q) ||
        (o.empresa ?? "").toLowerCase().includes(q) ||
        (o.ejecutivo ?? "").toLowerCase().includes(q)
      );
    });
  }, [cerradas, filtroGrupoC, buscarC, filtroEtapaC, filtroMotivoC]);

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
          onClick={vista === "abierto" ? load : loadCerradas}
          disabled={vista === "abierto" ? loading : loadingCerradas}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={16} className={(vista === "abierto" ? loading : loadingCerradas) ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
        <button
          onClick={() => setVista("abierto")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            vista === "abierto" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text"
          }`}
        >
          Pipeline abierto
        </button>
        <button
          onClick={() => setVista("cerradas")}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            vista === "cerradas" ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text"
          }`}
        >
          Ganadas y Perdidas
        </button>
      </div>

      {vista === "abierto" && (
      <>
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

          {/* Tabla COMPLETA de oportunidades (modo Monday) con filtros por grupo
              y búsqueda; clic en la fila abre el item en Monday; 📄 abre el PDF
              de la cotización adjunta. En modo demo se muestra el top estimado. */}
          <div className="mt-4 rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-text">
                {esMonday ? "Todas las oportunidades" : "Top oportunidades (por valor ponderado)"}
                {esMonday && <span className="ml-2 text-xs font-normal text-text-muted">{filtradas.length} de {(data.oportunidades ?? []).length}</span>}
              </h3>
              {esMonday && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar oportunidad, empresa o ejecutivo…"
                    className="h-8 w-64 rounded-lg border border-border bg-bg px-3 text-xs placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <select
                    value={filtroGrupo}
                    onChange={(e) => setFiltroGrupo(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
                  >
                    <option value="">Todos los grupos</option>
                    {(data.grupos ?? []).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium">Oportunidad</th>
                    {esMonday && <th className="px-4 py-2 font-medium">Empresa</th>}
                    {esMonday && <th className="px-4 py-2 font-medium">Ejecutivo</th>}
                    {esMonday && <th className="px-4 py-2 font-medium">Grupo</th>}
                    <th className="px-4 py-2 font-medium">Etapa</th>
                    {!esMonday && <th className="px-4 py-2 font-medium">Prioridad</th>}
                    <th className="px-4 py-2 text-right font-medium">Prob.</th>
                    <th className="px-4 py-2 text-right font-medium">Valor{esMonday ? "" : " est."}</th>
                    <th className="px-4 py-2 text-right font-medium">Ponderado</th>
                    <th className="px-4 py-2 font-medium">Cierre</th>
                    {esMonday && <th className="px-4 py-2 font-medium">Cotización</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((o) => (
                    <tr
                      key={o.itemId}
                      onClick={() => o.mondayUrl && window.open(o.mondayUrl, "_blank", "noopener")}
                      className={`border-b border-border/60 last:border-0 ${o.mondayUrl ? "cursor-pointer transition-colors hover:bg-accent/[0.04]" : ""}`}
                      title={o.mondayUrl ? "Abrir en Monday" : undefined}
                    >
                      <td className="px-4 py-2 font-medium text-text">
                        <span className="inline-flex items-center gap-1.5">
                          {o.itemName}
                          {o.mondayUrl && <ExternalLink size={12} className="shrink-0 text-text-muted/60" />}
                        </span>
                      </td>
                      {esMonday && <td className="px-4 py-2 text-text-muted">{o.empresa ?? "—"}</td>}
                      {esMonday && <td className="px-4 py-2 text-text-muted">{o.ejecutivo ?? "—"}</td>}
                      {esMonday && <td className="px-4 py-2"><span className="rounded-full bg-border/50 px-2 py-0.5 text-[11px] text-text-muted">{o.grupo ?? "—"}</span></td>}
                      <td className="px-4 py-2"><span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: (ETAPA_COLOR[o.etapa] ?? "#1462b4") + "22", color: ETAPA_COLOR[o.etapa] ?? "#1462b4" }}>{o.etapa}</span></td>
                      {!esMonday && (
                        <td className="px-4 py-2">{o.prioridad ? <span className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${PRIO_CHIP[o.prioridad]}`}>{o.prioridad}</span> : "—"}</td>
                      )}
                      <td className="px-4 py-2 text-right tabular-nums">{o.probabilidad}% <span className="text-[10px] text-text-muted">({FUENTE_PROB_LABEL[o.probabilidadFuente] ?? o.probabilidadFuente})</span></td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">{o.sinMonto ? "sin monto" : money(o.valorEstimado, moneda)}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-text">{o.sinMonto ? "—" : money(o.valorPonderado, moneda)}</td>
                      <td className="px-4 py-2 text-text-muted">{o.mesCierre}</td>
                      {esMonday && (
                        <td className="px-4 py-2">
                          {o.cotizacion ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); window.open(o.cotizacion!.url, "_blank", "noopener"); }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/5"
                              title={o.cotizacion.nombre}
                            >
                              <FileText size={12} /> PDF
                            </button>
                          ) : (
                            <span className="text-[11px] text-text-muted/60">{o.archivos ? `${o.archivos} archivo(s)` : "—"}</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {esMonday && filtradas.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-text-muted">Sin oportunidades con esos filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {esMonday && (
              <p className="border-t border-border px-4 py-2 text-[11px] text-text-muted">
                Clic en una fila abre el item en Monday. El botón PDF abre la cotización adjunta al item (enlace temporal de Monday).
              </p>
            )}
          </div>
        </>
      )}
      </>
      )}

      {vista === "cerradas" && (
        <CerradasView
          data={cerradas}
          loading={loadingCerradas}
          error={errorCerradas}
          filtradas={filtradasC}
          filtroGrupo={filtroGrupoC}
          setFiltroGrupo={setFiltroGrupoC}
          filtroEtapa={filtroEtapaC}
          setFiltroEtapa={setFiltroEtapaC}
          filtroMotivo={filtroMotivoC}
          setFiltroMotivo={setFiltroMotivoC}
          buscar={buscarC}
          setBuscar={setBuscarC}
        />
      )}
    </div>
  );
}

function CerradasView({
  data, loading, error, filtradas, filtroGrupo, setFiltroGrupo, filtroEtapa, setFiltroEtapa, filtroMotivo, setFiltroMotivo, buscar, setBuscar
}: {
  data: ForecastCerradasReport | null;
  loading: boolean;
  error: string | null;
  filtradas: ForecastCerradasReport["oportunidades"];
  filtroGrupo: string;
  setFiltroGrupo: (v: string) => void;
  filtroEtapa: "" | "Ganado" | "Perdido";
  setFiltroEtapa: (v: "" | "Ganado" | "Perdido") => void;
  filtroMotivo: string;
  setFiltroMotivo: (v: string) => void;
  buscar: string;
  setBuscar: (v: string) => void;
}) {
  const moneda = data?.supuestos.moneda ?? "MXN";

  if (error) {
    return <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>;
  }
  if (loading && !data) {
    return <div className="py-16 text-center text-sm text-text-muted">Cargando ganadas y perdidas…</div>;
  }
  if (!data || (data.stats.totalGanadas === 0 && data.stats.totalPerdidas === 0)) {
    return (
      <div className="rounded-xl border border-border bg-surface py-16 text-center text-sm text-text-muted">
        Aún no hay oportunidades cerradas (ganadas o perdidas) en el board.
      </div>
    );
  }

  const mesData = data.porMes.map((m) => ({ mes: m.mes, ganado: m.valorGanado, perdido: m.valorPerdido }));

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Ganadas" value={data.stats.totalGanadas} color="text-success" />
        <StatCard label="Perdidas" value={data.stats.totalPerdidas} color="text-danger" />
        <StatCard label="Valor ganado" value={money(data.stats.valorGanado, moneda)} color="text-success" />
        <StatCard label="Valor perdido" value={money(data.stats.valorPerdido, moneda)} color="text-danger" />
        <StatCard label="Tasa de cierre" value={`${data.stats.tasaCierre}%`} sub="ganadas / (ganadas + perdidas)" />
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/25 bg-info/[0.06] px-4 py-2.5 text-xs text-text-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-info" />
        <span><strong className="text-text">Supuestos:</strong> {data.supuestos.nota}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text"><DollarSign size={15} className="text-accent" /> Ganado vs. perdido por mes (fecha real de cierre)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mesData} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tickFormatter={moneyShort} tick={{ fontSize: 11, fill: "#64748b" }} width={48} />
              <Tooltip formatter={(v) => money(Number(v) || 0, moneda)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="ganado" name="Ganado" radius={[4, 4, 0, 0]} fill={ETAPA_COLOR["Ganado"]} />
              <Bar dataKey="perdido" name="Perdido" radius={[4, 4, 0, 0]} fill={ETAPA_COLOR["Perdido"]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-text">Ganado vs. perdido</h3>
          <div className="flex flex-col gap-3 pt-2">
            {(["Ganado", "Perdido"] as const).map((etapa) => {
              const valor = etapa === "Ganado" ? data.stats.valorGanado : data.stats.valorPerdido;
              const count = etapa === "Ganado" ? data.stats.totalGanadas : data.stats.totalPerdidas;
              const max = Math.max(1, data.stats.valorGanado, data.stats.valorPerdido);
              return (
                <div key={etapa}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium text-text">{etapa} <span className="text-text-muted">({count})</span></span>
                    <span className="font-semibold text-text">{money(valor, moneda)}</span>
                  </div>
                  <div className="h-5 overflow-hidden rounded-md bg-black/[0.06]">
                    <div className="h-full rounded-md transition-all" style={{ width: `${(valor / max) * 100}%`, background: ETAPA_COLOR[etapa] }} />
                  </div>
                </div>
              );
            })}
          </div>
          {data.stats.ticketPromedioGanado > 0 && (
            <p className="mt-4 text-xs text-text-muted">Ticket promedio ganado: <span className="font-semibold text-text">{money(data.stats.ticketPromedioGanado, moneda)}</span></p>
          )}
        </div>
      </div>

      {data.porEjecutivo.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface">
          <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-text">
            <Users size={15} className="text-accent" /> Ganadas / perdidas por ejecutivo
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Ejecutivo</th>
                  <th className="px-4 py-2 text-right font-medium">Ganadas</th>
                  <th className="px-4 py-2 text-right font-medium">Perdidas</th>
                  <th className="px-4 py-2 text-right font-medium">Valor ganado</th>
                  <th className="px-4 py-2 text-right font-medium">Valor perdido</th>
                </tr>
              </thead>
              <tbody>
                {data.porEjecutivo.map((e) => (
                  <tr key={e.ejecutivo} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium text-text">{e.ejecutivo}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-success">{e.ganadas}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-danger">{e.perdidas}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-muted">{money(e.valorGanado, moneda)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-muted">{money(e.valorPerdido, moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.porMotivo.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-1 text-sm font-semibold text-text">Motivos de pérdida</h3>
          <p className="mb-3 text-[11px] text-text-muted">
            Del campo "Motivo de no compra*" en Monday, capturado por el vendedor al marcar una oportunidad como perdida. Clic en un motivo filtra la tabla de abajo.
            {data.stats.perdidasSinMotivo > 0 && ` ${data.stats.perdidasSinMotivo} perdida(s) sin motivo capturado.`}
          </p>
          <div className="flex flex-col gap-2.5">
            {data.porMotivo.map((m) => {
              const max = Math.max(1, ...data.porMotivo.map((x) => x.count));
              const activo = filtroMotivo === m.motivo;
              return (
                <button
                  key={m.motivo}
                  onClick={() => setFiltroMotivo(activo ? "" : m.motivo)}
                  className={`rounded-lg text-left transition-colors ${activo ? "bg-danger/[0.06]" : "hover:bg-black/[0.02]"}`}
                >
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className={`font-medium ${activo ? "text-danger" : "text-text"}`}>{m.motivo}</span>
                    <span className="text-text-muted">{m.count} {m.count === 1 ? "caso" : "casos"} · {money(m.valor, moneda)}</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-md bg-black/[0.06]">
                    <div className="h-full rounded-md bg-danger transition-all" style={{ width: `${(m.count / max) * 100}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text">
            Oportunidades cerradas
            <span className="ml-2 text-xs font-normal text-text-muted">{filtradas.length} de {data.oportunidades.length}</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar oportunidad, empresa o ejecutivo…"
              className="h-8 w-64 rounded-lg border border-border bg-bg px-3 text-xs placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value as "" | "Ganado" | "Perdido")}
              className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
            >
              <option value="">Ganadas y perdidas</option>
              <option value="Ganado">Solo ganadas</option>
              <option value="Perdido">Solo perdidas</option>
            </select>
            <select
              value={filtroGrupo}
              onChange={(e) => setFiltroGrupo(e.target.value)}
              className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
            >
              <option value="">Todos los grupos</option>
              {data.grupos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {data.porMotivo.length > 0 && (
              <select
                value={filtroMotivo}
                onChange={(e) => setFiltroMotivo(e.target.value)}
                className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
              >
                <option value="">Todos los motivos de pérdida</option>
                {data.porMotivo.map((m) => <option key={m.motivo} value={m.motivo}>{m.motivo} ({m.count})</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-4 py-2 font-medium">Oportunidad</th>
                <th className="px-4 py-2 font-medium">Empresa</th>
                <th className="px-4 py-2 font-medium">Ejecutivo</th>
                <th className="px-4 py-2 font-medium">Grupo</th>
                <th className="px-4 py-2 font-medium">Etapa</th>
                <th className="px-4 py-2 text-right font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Cierre real</th>
                <th className="px-4 py-2 font-medium">Cotización</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((o) => (
                <tr
                  key={o.itemId}
                  onClick={() => o.mondayUrl && window.open(o.mondayUrl, "_blank", "noopener")}
                  className={`border-b border-border/60 last:border-0 ${o.mondayUrl ? "cursor-pointer transition-colors hover:bg-accent/[0.04]" : ""}`}
                  title={o.mondayUrl ? "Abrir en Monday" : undefined}
                >
                  <td className="px-4 py-2 font-medium text-text">
                    <span className="inline-flex items-center gap-1.5">
                      {o.itemName}
                      {o.mondayUrl && <ExternalLink size={12} className="shrink-0 text-text-muted/60" />}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-muted">{o.empresa ?? "—"}</td>
                  <td className="px-4 py-2 text-text-muted">{o.ejecutivo ?? "—"}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-border/50 px-2 py-0.5 text-[11px] text-text-muted">{o.grupo ?? "—"}</span></td>
                  <td className="px-4 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: ETAPA_COLOR[o.etapa] + "22", color: ETAPA_COLOR[o.etapa] }}>{o.etapa}</span>
                    {o.motivoPerdida && <div className="mt-1 text-[11px] text-text-muted">{o.motivoPerdida}</div>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-muted">{o.sinMonto ? "sin monto" : money(o.valor ?? 0, moneda)}</td>
                  <td className="px-4 py-2 text-text-muted">{o.fechaCierreReal ?? "—"}</td>
                  <td className="px-4 py-2">
                    {o.cotizacion ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(o.cotizacion!.url, "_blank", "noopener"); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/5"
                        title={o.cotizacion.nombre}
                      >
                        <FileText size={12} /> PDF
                      </button>
                    ) : (
                      <span className="text-[11px] text-text-muted/60">{o.archivos ? `${o.archivos} archivo(s)` : "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-text-muted">Sin oportunidades con esos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2 text-[11px] text-text-muted">
          Clic en una fila abre el item en Monday. El botón PDF abre la cotización adjunta al item (enlace temporal de Monday).
        </p>
      </div>
    </>
  );
}
