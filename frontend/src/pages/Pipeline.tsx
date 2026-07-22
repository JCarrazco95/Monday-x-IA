import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { TrendingUp, RefreshCw, Info, DollarSign, Users, Database, ExternalLink, FileText, Download, Printer, ArrowUp, ArrowDown, Minus, X, ChevronDown, ChevronRight, Calendar, Clock } from "lucide-react";
import { api } from "../lib/api";
import { exportToCsv, exportToXlsx } from "../lib/exportUtils";
import type { ForecastReport, ForecastCerradasReport, ForecastCerradaItem, ForecastOpportunity } from "../types";

// ── Fechas: comparativo de periodos (semana/mes actual vs. el tramo anterior) ──
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeekMonday(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  return r;
}
type PeriodPreset = "semana" | "mes";
interface PeriodRange { curDesde: string; curHasta: string; prevDesde: string; prevHasta: string; curLabel: string; prevLabel: string; }
interface ComparativoAcum { ganadas: number; perdidas: number; valorGanado: number; items: ForecastCerradaItem[]; motivos: Map<string, number> }
interface ComparativoFila {
  nombre: string;
  actual: ComparativoAcum; anterior: ComparativoAcum;
  tasaActual: number; tasaAnterior: number;
  deltaGanadas: number | null; deltaValor: number | null;
  topMotivo: { motivo: string; count: number } | null;
  diagnostico: string[];
}
interface Comparativo { rango: PeriodRange; filas: ComparativoFila[]; tasaPromedioEquipo: number; }
function periodRanges(preset: PeriodPreset): PeriodRange {
  const now = new Date();
  if (preset === "semana") {
    const curStart = startOfWeekMonday(now);
    const prevStart = new Date(curStart); prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(curStart); prevEnd.setDate(prevEnd.getDate() - 1);
    return {
      curDesde: toISODate(curStart), curHasta: toISODate(now),
      prevDesde: toISODate(prevStart), prevHasta: toISODate(prevEnd),
      curLabel: "Esta semana", prevLabel: "Semana pasada (mismo tramo)"
    };
  }
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const diasMesPrevio = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const prevMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), diasMesPrevio));
  return {
    curDesde: toISODate(curStart), curHasta: toISODate(now),
    prevDesde: toISODate(prevMonthStart), prevHasta: toISODate(prevMonthSameDay),
    curLabel: "Este mes", prevLabel: "Mes pasado (mismo tramo)"
  };
}
function pct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null; // null = "nuevo" (sin base de comparación)
  return Math.round(((cur - prev) / prev) * 100);
}
function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-text-muted">nuevo</span>;
  if (value === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] text-text-muted"><Minus size={11} /> 0%</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-success" : "text-danger"}`}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />} {Math.abs(value)}%
    </span>
  );
}

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

// Exporta EXACTAMENTE lo que el usuario está viendo/filtrando en pantalla
// (no un dump completo aparte) — CSV/XLS client-side, PDF = vista de impresión
// del navegador (print:hidden oculta nav/filtros, ver index.css / clases print:).
function ExportButtons({ filename, rows }: { filename: string; rows: Record<string, unknown>[] }) {
  return (
    <div className="flex items-center gap-1 print:hidden">
      <button
        onClick={() => exportToCsv(filename, rows)}
        disabled={rows.length === 0}
        title="Descargar CSV"
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-text-muted hover:text-text disabled:opacity-40"
      >
        <Download size={12} /> CSV
      </button>
      <button
        onClick={() => exportToXlsx(filename, rows)}
        disabled={rows.length === 0}
        title="Descargar Excel"
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-text-muted hover:text-text disabled:opacity-40"
      >
        <Download size={12} /> XLS
      </button>
      <button
        onClick={() => window.print()}
        title="Imprimir / guardar como PDF"
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-text-muted hover:text-text"
      >
        <Printer size={12} /> PDF
      </button>
    </div>
  );
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

// ===========================================================================
//  Detalle de oportunidad — resumen completo estilo "Análisis IA" (Leads.tsx
//  ItemView): métricas + bloques, en un modal, para no perder la tabla con
//  filtros de fondo. Sirve tanto para el pipeline abierto como para cerradas
//  (ambas traen las mismas columnas nuevas: origen, giroUso, plazoMeses, etc).
// ===========================================================================
type DetailItem =
  | { kind: "abierto"; o: ForecastOpportunity }
  | { kind: "cerrada"; o: ForecastCerradaItem };

function DetailMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-black/[0.02] p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DetailBlock({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-text">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function OpportunityDetailModal({ item, moneda, onClose }: { item: DetailItem; moneda: string; onClose: () => void }) {
  const { o } = item;
  const esCerrada = item.kind === "cerrada";
  const cerrada = esCerrada ? (o as ForecastCerradaItem) : null;
  const abierta = !esCerrada ? (o as ForecastOpportunity) : null;
  const etapa = esCerrada ? cerrada!.etapa : abierta!.etapa;
  const valor = esCerrada ? cerrada!.valor : abierta!.valorEstimado;
  const sinMonto = esCerrada ? cerrada!.sinMonto : abierta!.sinMonto;
  const initials = o.itemName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
            {initials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-text">{o.itemName}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              {o.empresa && <span>{o.empresa}</span>}
              {o.ejecutivo && <span>· {o.ejecutivo}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: (ETAPA_COLOR[etapa] ?? "#1462b4") + "22", color: ETAPA_COLOR[etapa] ?? "#1462b4" }}
              >
                {etapa}
              </span>
              {o.grupo && <span className="rounded-full bg-border/50 px-2 py-0.5 text-[11px] text-text-muted">{o.grupo}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-black/[0.06] hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailMetric label={sinMonto ? "Valor" : "Valor del acuerdo"}>
              <div className="text-lg font-bold text-text">{sinMonto ? "Sin monto" : money(valor ?? 0, moneda)}</div>
            </DetailMetric>
            {abierta && (
              <DetailMetric label="Probabilidad de cierre">
                <div className="text-lg font-bold text-text">{abierta.probabilidad}%</div>
                <div className="text-[11px] text-text-muted">Ponderado: {money(abierta.valorPonderado, moneda)}</div>
              </DetailMetric>
            )}
            {cerrada && (
              <DetailMetric label={cerrada.etapa === "Ganado" ? "Resultado" : "Motivo de pérdida"}>
                <div className={`text-[13px] font-semibold ${cerrada.etapa === "Ganado" ? "text-success" : "text-danger"}`}>
                  {cerrada.etapa === "Ganado" ? "Ganado ✓" : (cerrada.motivoPerdida || "Sin motivo capturado")}
                </div>
              </DetailMetric>
            )}
            {(cerrada?.plazoMeses ?? abierta?.plazoMeses) != null && (
              <DetailMetric label="Plazo de renta">
                <div className="text-lg font-bold text-text">{cerrada?.plazoMeses ?? abierta?.plazoMeses} meses</div>
              </DetailMetric>
            )}
            {cerrada?.cicloVentaDias != null && (
              <DetailMetric label="Ciclo de venta">
                <div className="text-lg font-bold text-text">{cerrada.cicloVentaDias} días</div>
                <div className="text-[11px] text-text-muted">creación → cierre</div>
              </DetailMetric>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(cerrada?.origen ?? abierta?.origen) && (
              <DetailBlock icon="📍" title="Origen del lead">
                <p className="text-[13px] text-text">{cerrada?.origen ?? abierta?.origen}</p>
              </DetailBlock>
            )}
            {(cerrada?.giroUso ?? abierta?.giroUso) && (
              <DetailBlock icon="🚚" title="Uso de la unidad">
                <p className="text-[13px] text-text">{cerrada?.giroUso ?? abierta?.giroUso}</p>
              </DetailBlock>
            )}
          </div>

          <DetailBlock icon="📅" title="Fechas">
            <div className="flex flex-col gap-1.5 text-[13px] text-text">
              {(cerrada?.fechaCreacion ?? abierta?.fechaCreacion) && (
                <div className="flex items-center gap-2"><Calendar size={13} className="text-text-muted" /> Acuerdo creado: {cerrada?.fechaCreacion ?? abierta?.fechaCreacion}</div>
              )}
              {abierta?.fechaCierreEstimada && (
                <div className="flex items-center gap-2"><Clock size={13} className="text-text-muted" /> Cierre estimado: {abierta.fechaCierreEstimada}</div>
              )}
              {cerrada?.fechaCierreReal && (
                <div className="flex items-center gap-2"><Clock size={13} className="text-text-muted" /> Cierre real: {cerrada.fechaCierreReal}</div>
              )}
              {!(cerrada?.fechaCreacion ?? abierta?.fechaCreacion) && !abierta?.fechaCierreEstimada && !cerrada?.fechaCierreReal && (
                <span className="text-text-muted">Sin fechas capturadas.</span>
              )}
            </div>
          </DetailBlock>

          {(cerrada?.cotizacion ?? abierta?.cotizacion) && (
            <a
              href={(cerrada?.cotizacion ?? abierta?.cotizacion)!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/20"
            >
              <FileText size={13} /> Ver cotización adjunta
            </a>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-black/[0.02] px-5 py-3">
          {o.mondayUrl ? (
            <a href={o.mondayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              Abrir en Monday <ExternalLink size={12} />
            </a>
          ) : <span />}
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Pipeline() {
  const [vista, setVista] = useState<"abierto" | "cerradas">("abierto");
  const [detalle, setDetalle] = useState<DetailItem | null>(null);

  const [data, setData] = useState<ForecastReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtros de la tabla completa (modo Monday).
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [buscar, setBuscar] = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("");
  const [filtroMes, setFiltroMes] = useState(""); // mesCierreKey (estimado)

  // Vista 2: ganadas/perdidas (histórico de cierres reales, solo modo Monday).
  const [cerradas, setCerradas] = useState<ForecastCerradasReport | null>(null);
  const [loadingCerradas, setLoadingCerradas] = useState(false);
  const [errorCerradas, setErrorCerradas] = useState<string | null>(null);
  const [filtroGrupoC, setFiltroGrupoC] = useState("");
  const [buscarC, setBuscarC] = useState("");
  const [filtroEtapaC, setFiltroEtapaC] = useState<"" | "Ganado" | "Perdido">("");
  const [filtroMotivoC, setFiltroMotivoC] = useState("");
  const [filtroVendedorC, setFiltroVendedorC] = useState("");
  const [fechaDesdeC, setFechaDesdeC] = useState(""); // fechaCierreReal, YYYY-MM-DD
  const [fechaHastaC, setFechaHastaC] = useState("");
  const [comparPreset, setComparPreset] = useState<PeriodPreset>("semana");

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

  // Vendedores únicos presentes en cada dataset (para los selects de filtro).
  const vendedores = useMemo(
    () => [...new Set((data?.oportunidades ?? []).map((o) => o.ejecutivo).filter((v): v is string => Boolean(v)))].sort(),
    [data]
  );
  const vendedoresC = useMemo(
    () => [...new Set((cerradas?.oportunidades ?? []).map((o) => o.ejecutivo).filter((v): v is string => Boolean(v)))].sort(),
    [cerradas]
  );
  // Meses de cierre estimado únicos presentes (para el filtro del pipeline abierto).
  const mesesDisponibles = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of data?.oportunidades ?? []) if (o.mesCierreKey) map.set(o.mesCierreKey, o.mesCierre);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  // Tabla: en modo Monday, TODAS las oportunidades con filtros; en demo, el top.
  const filtradas = useMemo(() => {
    const base = esMonday ? (data?.oportunidades ?? data?.topOportunidades ?? []) : (data?.topOportunidades ?? []);
    const q = buscar.trim().toLowerCase();
    return base.filter((o) => {
      if (filtroGrupo && o.grupo !== filtroGrupo) return false;
      if (filtroVendedor && o.ejecutivo !== filtroVendedor) return false;
      if (filtroMes && o.mesCierreKey !== filtroMes) return false;
      if (!q) return true;
      return (
        o.itemName.toLowerCase().includes(q) ||
        (o.empresa ?? "").toLowerCase().includes(q) ||
        (o.ejecutivo ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, esMonday, filtroGrupo, filtroVendedor, filtroMes, buscar]);

  const filtradasC = useMemo(() => {
    const base = cerradas?.oportunidades ?? [];
    const q = buscarC.trim().toLowerCase();
    return base.filter((o) => {
      if (filtroGrupoC && o.grupo !== filtroGrupoC) return false;
      if (filtroEtapaC && o.etapa !== filtroEtapaC) return false;
      if (filtroVendedorC && o.ejecutivo !== filtroVendedorC) return false;
      if (fechaDesdeC && (o.fechaCierreReal ?? "") < fechaDesdeC) return false;
      if (fechaHastaC && (o.fechaCierreReal ?? "") > fechaHastaC) return false;
      // El dropdown de Monday puede traer varios motivos separados por coma.
      if (filtroMotivoC && !(o.motivoPerdida ?? "").split(",").map((s) => s.trim()).includes(filtroMotivoC)) return false;
      if (!q) return true;
      return (
        o.itemName.toLowerCase().includes(q) ||
        (o.empresa ?? "").toLowerCase().includes(q) ||
        (o.ejecutivo ?? "").toLowerCase().includes(q)
      );
    });
  }, [cerradas, filtroGrupoC, buscarC, filtroEtapaC, filtroMotivoC, filtroVendedorC, fechaDesdeC, fechaHastaC]);

  // Comparativo de periodos (mide rendimiento del vendedor): siempre sobre el
  // universo COMPLETO de cerradas (ignora filtros de grupo/etapa/motivo/texto,
  // que son para explorar la tabla, no para comparar desempeño), respetando
  // solo el filtro de vendedor si está activo.
  const comparativo = useMemo(() => {
    const todas = cerradas?.oportunidades ?? [];
    const universo = filtroVendedorC ? todas.filter((o) => o.ejecutivo === filtroVendedorC) : todas;
    const rango = periodRanges(comparPreset);
    type Acum = { ganadas: number; perdidas: number; valorGanado: number; items: ForecastCerradaItem[]; motivos: Map<string, number> };
    const vacio = (): Acum => ({ ganadas: 0, perdidas: 0, valorGanado: 0, items: [], motivos: new Map() });
    const enRango = (desde: string, hasta: string) => {
      const map = new Map<string, Acum>();
      for (const o of universo) {
        if (!o.fechaCierreReal || o.fechaCierreReal < desde || o.fechaCierreReal > hasta) continue;
        const nombre = o.ejecutivo ?? "Sin asignar";
        const cur = map.get(nombre) ?? vacio();
        cur.items.push(o);
        if (o.etapa === "Ganado") {
          cur.ganadas += 1;
          cur.valorGanado += o.valor ?? 0;
        } else {
          cur.perdidas += 1;
          for (const m of (o.motivoPerdida ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
            cur.motivos.set(m, (cur.motivos.get(m) ?? 0) + 1);
          }
        }
        map.set(nombre, cur);
      }
      return map;
    };
    const actual = enRango(rango.curDesde, rango.curHasta);
    const anterior = enRango(rango.prevDesde, rango.prevHasta);
    const nombres = [...new Set([...actual.keys(), ...anterior.keys()])];
    const filasBase = nombres.map((nombre) => {
      const a = actual.get(nombre) ?? vacio();
      const p = anterior.get(nombre) ?? vacio();
      const totalA = a.ganadas + a.perdidas;
      const totalP = p.ganadas + p.perdidas;
      const topMotivoEntry = [...a.motivos.entries()].sort((x, y) => y[1] - x[1])[0] ?? null;
      return {
        nombre,
        actual: a, anterior: p,
        tasaActual: totalA ? Math.round((a.ganadas / totalA) * 100) : 0,
        tasaAnterior: totalP ? Math.round((p.ganadas / totalP) * 100) : 0,
        deltaGanadas: pct(a.ganadas, p.ganadas),
        deltaValor: pct(a.valorGanado, p.valorGanado),
        topMotivo: topMotivoEntry ? { motivo: topMotivoEntry[0], count: topMotivoEntry[1] } : null
      };
    }).sort((x, y) => (y.actual.ganadas + y.actual.perdidas) - (x.actual.ganadas + x.actual.perdidas));

    // Diagnóstico: compara cada vendedor contra el promedio del equipo en el
    // periodo actual (solo entre quienes tuvieron al menos un cierre), y
    // detecta motivo de pérdida recurrente + caída fuerte vs. el periodo previo.
    const conCierres = filasBase.filter((f) => f.actual.ganadas + f.actual.perdidas > 0);
    const tasaPromedioEquipo = conCierres.length
      ? Math.round(conCierres.reduce((s, f) => s + f.tasaActual, 0) / conCierres.length)
      : 0;
    const filas = filasBase.map((f) => {
      const totalActual = f.actual.ganadas + f.actual.perdidas;
      const diagnostico: string[] = [];
      if (totalActual === 0) {
        diagnostico.push("Sin cierres (ganados o perdidos) en este periodo.");
      } else {
        if (tasaPromedioEquipo > 0 && f.tasaActual < tasaPromedioEquipo - 15) {
          diagnostico.push(`Tasa de cierre ${tasaPromedioEquipo - f.tasaActual} pts por debajo del promedio del equipo (${tasaPromedioEquipo}%).`);
        }
        if (f.topMotivo && f.topMotivo.count >= 2) {
          diagnostico.push(`Motivo de pérdida recurrente: "${f.topMotivo.motivo}" (${f.topMotivo.count}×).`);
        }
        if (f.deltaGanadas !== null && f.deltaGanadas <= -25) {
          diagnostico.push(`Ventas ganadas cayeron ${Math.abs(f.deltaGanadas)}% vs. el periodo anterior.`);
        }
        if (diagnostico.length === 0) {
          diagnostico.push(tasaPromedioEquipo > 0 && f.tasaActual >= tasaPromedioEquipo
            ? "Tasa de cierre en línea o por arriba del equipo."
            : "Sin alertas relevantes en este periodo.");
        }
      }
      return { ...f, diagnostico };
    });
    return { rango, filas, tasaPromedioEquipo };
  }, [cerradas, comparPreset, filtroVendedorC]);

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
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50 print:hidden"
        >
          <RefreshCw size={16} className={(vista === "abierto" ? loading : loadingCerradas) ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="mb-5 flex gap-1 border-b border-border print:hidden">
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
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Buscar oportunidad, empresa o ejecutivo…"
                    className="h-8 w-64 rounded-lg border border-border bg-bg px-3 text-xs placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <select
                    value={filtroVendedor}
                    onChange={(e) => setFiltroVendedor(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
                  >
                    <option value="">Todos los vendedores</option>
                    {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <select
                    value={filtroMes}
                    onChange={(e) => setFiltroMes(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
                  >
                    <option value="">Todos los meses de cierre</option>
                    {mesesDisponibles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select
                    value={filtroGrupo}
                    onChange={(e) => setFiltroGrupo(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
                  >
                    <option value="">Todos los grupos</option>
                    {(data.grupos ?? []).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <ExportButtons
                    filename="pipeline-abierto"
                    rows={filtradas.map((o) => ({
                      Oportunidad: o.itemName, Empresa: o.empresa ?? "", Ejecutivo: o.ejecutivo ?? "",
                      Grupo: o.grupo ?? "", Etapa: o.etapa, "Probabilidad %": o.probabilidad,
                      Valor: o.valorEstimado, Ponderado: o.valorPonderado, "Mes de cierre": o.mesCierre,
                      "Origen del lead": o.origen ?? "", "Uso de la unidad": o.giroUso ?? "", "Plazo (meses)": o.plazoMeses ?? ""
                    }))}
                  />
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
                      onClick={() => setDetalle({ kind: "abierto", o })}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/[0.04]"
                      title="Ver detalle de la oportunidad"
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
                Clic en una fila abre el detalle de la oportunidad. El botón PDF abre la cotización adjunta al item (enlace temporal de Monday).
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
          filtroVendedor={filtroVendedorC}
          setFiltroVendedor={setFiltroVendedorC}
          vendedores={vendedoresC}
          fechaDesde={fechaDesdeC}
          setFechaDesde={setFechaDesdeC}
          fechaHasta={fechaHastaC}
          setFechaHasta={setFechaHastaC}
          buscar={buscarC}
          setBuscar={setBuscarC}
          comparPreset={comparPreset}
          setComparPreset={setComparPreset}
          comparativo={comparativo}
          onSelect={(o) => setDetalle({ kind: "cerrada", o })}
        />
      )}

      {detalle && (
        <OpportunityDetailModal
          item={detalle}
          moneda={data?.supuestos.moneda ?? cerradas?.supuestos.moneda ?? "MXN"}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

function CerradasView({
  data, loading, error, filtradas,
  filtroGrupo, setFiltroGrupo, filtroEtapa, setFiltroEtapa, filtroMotivo, setFiltroMotivo,
  filtroVendedor, setFiltroVendedor, vendedores, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta,
  buscar, setBuscar, comparPreset, setComparPreset, comparativo, onSelect
}: {
  data: ForecastCerradasReport | null;
  loading: boolean;
  error: string | null;
  filtradas: ForecastCerradaItem[];
  filtroGrupo: string;
  setFiltroGrupo: (v: string) => void;
  filtroEtapa: "" | "Ganado" | "Perdido";
  setFiltroEtapa: (v: "" | "Ganado" | "Perdido") => void;
  filtroMotivo: string;
  setFiltroMotivo: (v: string) => void;
  filtroVendedor: string;
  setFiltroVendedor: (v: string) => void;
  vendedores: string[];
  fechaDesde: string;
  setFechaDesde: (v: string) => void;
  fechaHasta: string;
  setFechaHasta: (v: string) => void;
  buscar: string;
  setBuscar: (v: string) => void;
  comparPreset: PeriodPreset;
  setComparPreset: (v: PeriodPreset) => void;
  comparativo: Comparativo;
  onSelect: (o: ForecastCerradaItem) => void;
}) {
  const moneda = data?.supuestos.moneda ?? "MXN";
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

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
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Ganadas" value={data.stats.totalGanadas} color="text-success" />
        <StatCard label="Perdidas" value={data.stats.totalPerdidas} color="text-danger" />
        <StatCard label="Valor ganado" value={money(data.stats.valorGanado, moneda)} color="text-success" />
        <StatCard label="Valor perdido" value={money(data.stats.valorPerdido, moneda)} color="text-danger" />
        <StatCard label="Tasa de cierre" value={`${data.stats.tasaCierre}%`} sub="ganadas / (ganadas + perdidas)" />
        <StatCard
          label="Ciclo de venta"
          value={data.stats.cicloVentaPromedioDias != null ? `${data.stats.cicloVentaPromedioDias} días` : "—"}
          sub="creación → cierre, prom."
        />
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/25 bg-info/[0.06] px-4 py-2.5 text-xs text-text-muted">
        <Info size={14} className="mt-0.5 shrink-0 text-info" />
        <span><strong className="text-text">Supuestos:</strong> {data.supuestos.nota}</span>
      </div>

      {/* Comparativo de periodos: mide rendimiento por vendedor vs. el tramo
          anterior equivalente (no el periodo completo pasado, para comparar
          justo — ej. "lo que va de esta semana" vs. "lo mismo la semana pasada"). */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
            <TrendingUp size={15} className="text-accent" /> Comparativo de periodos — rendimiento por vendedor
          </h3>
          <div className="flex gap-1 rounded-lg border border-border p-0.5 print:hidden">
            <button
              onClick={() => setComparPreset("semana")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${comparPreset === "semana" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
            >
              Semanal
            </button>
            <button
              onClick={() => setComparPreset("mes")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${comparPreset === "mes" ? "bg-accent text-white" : "text-text-muted hover:text-text"}`}
            >
              Mensual
            </button>
          </div>
        </div>
        <p className="mb-1 text-[11px] text-text-muted">
          <span className="font-medium text-text">{comparativo.rango.curLabel}</span> ({comparativo.rango.curDesde} a {comparativo.rango.curHasta}) vs.{" "}
          <span className="font-medium text-text">{comparativo.rango.prevLabel}</span> ({comparativo.rango.prevDesde} a {comparativo.rango.prevHasta}).
          {filtroVendedor && ` Acotado a ${filtroVendedor}.`}
        </p>
        <p className="mb-3 text-[11px] text-text-muted">
          <strong className="text-text">Cómo leer esto:</strong> "Ganadas" y "Valor ganado" son los cierres del periodo actual (entre paréntesis, el periodo anterior); "vs. anterior" es el cambio %; "Tasa de cierre" es ganadas ÷ (ganadas + perdidas). Clic en un vendedor para ver sus oportunidades del periodo.
        </p>
        {comparativo.filas.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-muted">Sin cierres en ninguno de los dos periodos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="px-3 py-2 font-medium"></th>
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium" title="Acuerdos ganados en el periodo actual (entre paréntesis, el periodo anterior).">Ganadas</th>
                  <th className="px-3 py-2 text-right font-medium">vs. anterior</th>
                  <th className="px-3 py-2 text-right font-medium" title="Suma del valor de los acuerdos ganados en el periodo actual.">Valor ganado</th>
                  <th className="px-3 py-2 text-right font-medium">vs. anterior</th>
                  <th className="px-3 py-2 text-right font-medium" title="Ganadas ÷ (ganadas + perdidas) del periodo.">Tasa de cierre</th>
                  <th className="px-3 py-2 font-medium" title="Comparación automática contra el promedio del equipo en el periodo.">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.filas.map((f) => {
                  const abierto = expandedVendor === f.nombre;
                  return (
                    <Fragment key={f.nombre}>
                      <tr
                        onClick={() => setExpandedVendor(abierto ? null : f.nombre)}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/[0.03]"
                      >
                        <td className="px-3 py-2 text-text-muted">{abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="px-3 py-2 font-medium text-text">{f.nombre}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.actual.ganadas} <span className="text-text-muted">({f.anterior.ganadas})</span></td>
                        <td className="px-3 py-2 text-right"><Delta value={f.deltaGanadas} /></td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{money(f.actual.valorGanado, moneda)}</td>
                        <td className="px-3 py-2 text-right"><Delta value={f.deltaValor} /></td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.tasaActual}% <span className="text-text-muted">({f.tasaAnterior}%)</span></td>
                        <td className="px-3 py-2 text-[11px]">
                          <div className="flex flex-col gap-0.5">
                            {f.diagnostico.map((d, i) => {
                              const esAlerta = d.startsWith("Tasa de cierre") || d.startsWith("Motivo de pérdida") || d.startsWith("Ventas ganadas cayeron");
                              return <span key={i} className={esAlerta ? "text-warning" : "text-text-muted"}>{d}</span>;
                            })}
                          </div>
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="border-b border-border/60 bg-black/[0.015]">
                          <td colSpan={8} className="px-3 py-3">
                            {f.actual.items.length === 0 ? (
                              <p className="px-2 text-xs text-text-muted">Sin oportunidades cerradas en este periodo.</p>
                            ) : (
                              <table className="w-full text-[12px]">
                                <thead>
                                  <tr className="text-left text-[11px] text-text-muted">
                                    <th className="px-2 py-1 font-medium">Oportunidad</th>
                                    <th className="px-2 py-1 font-medium">Empresa</th>
                                    <th className="px-2 py-1 font-medium">Etapa</th>
                                    <th className="px-2 py-1 text-right font-medium">Valor</th>
                                    <th className="px-2 py-1 font-medium">Cierre real</th>
                                    <th className="px-2 py-1 font-medium">Motivo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {f.actual.items.map((o) => (
                                    <tr
                                      key={o.itemId}
                                      onClick={(e) => { e.stopPropagation(); onSelect(o); }}
                                      className="cursor-pointer border-t border-border/40 hover:bg-accent/[0.05]"
                                      title="Ver detalle de la oportunidad"
                                    >
                                      <td className="px-2 py-1.5 font-medium text-text">{o.itemName}</td>
                                      <td className="px-2 py-1.5 text-text-muted">{o.empresa ?? "—"}</td>
                                      <td className="px-2 py-1.5">
                                        <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: ETAPA_COLOR[o.etapa] + "22", color: ETAPA_COLOR[o.etapa] }}>{o.etapa}</span>
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-text-muted">{o.sinMonto ? "sin monto" : money(o.valor ?? 0, moneda)}</td>
                                      <td className="px-2 py-1.5 text-text-muted">{o.fechaCierreReal ?? "—"}</td>
                                      <td className="px-2 py-1.5 text-text-muted">{o.motivoPerdida ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
          <div className="flex flex-wrap items-center gap-2 print:hidden">
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
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
              className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
            >
              <option value="">Todos los vendedores</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
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
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                title="Cierre real desde"
                className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
              />
              <span className="text-xs text-text-muted">–</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                title="Cierre real hasta"
                className="h-8 rounded-lg border border-border bg-bg px-2 text-xs text-text-muted focus:outline-none"
              />
              {(fechaDesde || fechaHasta) && (
                <button
                  onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
                  className="text-xs text-text-muted hover:text-text"
                  title="Quitar rango de fechas"
                >
                  ✕
                </button>
              )}
            </div>
            <ExportButtons
              filename="ganadas-perdidas"
              rows={filtradas.map((o) => ({
                Oportunidad: o.itemName, Empresa: o.empresa ?? "", Ejecutivo: o.ejecutivo ?? "",
                Grupo: o.grupo ?? "", Etapa: o.etapa, Valor: o.valor ?? 0,
                "Motivo de pérdida": o.motivoPerdida ?? "", "Fecha de creación": o.fechaCreacion ?? "",
                "Cierre real": o.fechaCierreReal ?? "", "Ciclo de venta (días)": o.cicloVentaDias ?? "",
                "Origen del lead": o.origen ?? "", "Uso de la unidad": o.giroUso ?? "", "Plazo (meses)": o.plazoMeses ?? ""
              }))}
            />
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
                  onClick={() => onSelect(o)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/[0.04]"
                  title="Ver detalle de la oportunidad"
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
          Clic en una fila abre el detalle de la oportunidad. El botón PDF abre la cotización adjunta al item (enlace temporal de Monday).
        </p>
      </div>
    </>
  );
}
