import { useEffect, useState, useCallback } from "react";
import { ListChecks, RefreshCw, Send, Clock, Phone, AlertTriangle, Flame, Snowflake, CalendarClock } from "lucide-react";
import { api } from "../lib/api";
import type { NextBestAction, NextBestActionReport, NextBestActionType } from "../types";

// ===========================================================================
//  Next Best Action — agenda de seguimiento que nunca olvida.
//  Lee /api/nba (vista previa). El botón "Ejecutar" escribe las alertas de
//  alta prioridad en Monday para que las automatizaciones nativas notifiquen.
// ===========================================================================

const PRIO_CHIP: Record<NextBestAction["prioridad"], string> = {
  alta: "bg-danger/15 text-danger border border-danger/20",
  media: "bg-warning/15 text-warning border border-warning/20",
  baja: "bg-info/15 text-info border border-info/20"
};
const PRIO_BAR: Record<NextBestAction["prioridad"], string> = {
  alta: "border-l-danger",
  media: "border-l-warning",
  baja: "border-l-info"
};

const TIPO_META: Record<NextBestActionType, { label: string; icon: typeof Flame }> = {
  compromiso_vencido: { label: "Compromiso vencido", icon: CalendarClock },
  compromiso_sin_seguimiento: { label: "Compromiso sin seguimiento", icon: Clock },
  lead_caliente_sin_seguimiento: { label: "Lead caliente enfriándose", icon: Flame },
  lead_tibio_sin_seguimiento: { label: "Lead tibio enfriándose", icon: Snowflake },
  llamada_requiere_atencion: { label: "Llamada en riesgo", icon: AlertTriangle }
};

function StatCard({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${color ?? "text-text"}`}>{value}</div>
    </div>
  );
}

function ActionCard({ a }: { a: NextBestAction }) {
  const meta = TIPO_META[a.tipo];
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl border border-border border-l-4 bg-surface p-4 ${PRIO_BAR[a.prioridad]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className="shrink-0 text-text-muted" />
          <span className="font-semibold text-text">{a.itemName}</span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${PRIO_CHIP[a.prioridad]}`}>
          {a.prioridad}
        </span>
      </div>

      <div className="mt-2 text-sm text-text">{a.motivo}</div>
      <div className="mt-2 rounded-lg bg-accent/5 px-3 py-2 text-sm text-text">
        <span className="font-medium text-accent">Acción: </span>
        {a.accionSugerida}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span className="rounded-full bg-border/60 px-2 py-0.5">{meta.label}</span>
        {a.telefono && (
          <span className="inline-flex items-center gap-1">
            <Phone size={12} /> {a.telefono}
          </span>
        )}
        {typeof a.horasSinActividad === "number" && (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} /> {a.horasSinActividad}h sin actividad
          </span>
        )}
      </div>
    </div>
  );
}

export function NextBestAction() {
  const [report, setReport] = useState<NextBestActionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.getNextBestActions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    setNotice(null);
    try {
      const r = await api.runNextBestActions();
      setReport(r);
      setNotice(
        r.escrituraMonday
          ? `Alertas de alta prioridad escritas en Monday (${r.porPrioridad.alta}). Monday notificará al vendedor.`
          : "No había alertas de alta prioridad que escribir."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
            <ListChecks className="text-accent" /> Seguimiento · Next Best Action
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            El supervisor que nunca olvida: compromisos sin seguimiento, leads enfriándose y llamadas en riesgo.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Recalcular
          </button>
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            <Send size={16} className={running ? "animate-pulse" : ""} /> Ejecutar y escribir en Monday
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Alta prioridad" value={report?.porPrioridad.alta ?? 0} color="text-danger" />
        <StatCard label="Media" value={report?.porPrioridad.media ?? 0} color="text-warning" />
        <StatCard label="Total acciones" value={report?.totalAcciones ?? 0} />
        <StatCard label="Items revisados" value={report?.itemsRevisados ?? 0} color="text-text-muted" />
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-text-muted">Calculando agenda de seguimiento…</div>
      ) : !report || report.acciones.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <ListChecks className="mx-auto mb-3 text-success" size={32} />
          <div className="font-semibold text-text">Todo al día</div>
          <div className="mt-1 text-sm text-text-muted">No hay compromisos ni leads pendientes de seguimiento.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {report.acciones.map((a, i) => (
            <ActionCard key={`${a.reference}-${a.tipo}-${i}`} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}
