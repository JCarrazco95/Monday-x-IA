import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Sparkles, RefreshCw, ExternalLink, FileText, Truck, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import type { LeadsResponse, LeadSummary, LeadAnalysis } from "../../types";
import { useMondayActivity, PrincipalPanel, ActualizacionesPanel, ArchivosPanel } from "../../components/MondayExtraTabs";

// ===========================================================================
//  Board View para Monday.com — lista de leads + panel de resumen.
//  El análisis COMPLETO vive en el Item view (/monday/item?itemId=).
// ===========================================================================

const PRIO: Record<string, { label: string; cls: string }> = {
  caliente: { label: "Caliente", cls: "bg-danger/20 text-danger" },
  tibia:    { label: "Tibia",    cls: "bg-warning/20 text-warning" },
  fria:     { label: "Fría",     cls: "bg-info/20 text-info" }
};
const RIESGO_COL: Record<string, string> = { bajo: "text-success", medio: "text-warning", alto: "text-danger" };
const SENT_COL: Record<string, string> = { positivo: "text-success", neutro: "text-warning", negativo: "text-danger" };
const SCORE_COL = (s: number) => (s >= 75 ? "text-success" : s >= 50 ? "text-warning" : "text-danger");
const SCORE_BAR = (s: number) => (s >= 75 ? "bg-success" : s >= 50 ? "bg-warning" : "bg-danger");

function cap(s?: string | null) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function Kpi({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color ?? "text-text"}`}>{value}</p>
    </div>
  );
}

function LeadRow({ lead, active, onClick }: { lead: LeadSummary; active: boolean; onClick: () => void }) {
  const prio = lead.prioridad ? PRIO[lead.prioridad] : null;
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
        active ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-black/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{lead.itemName}</span>
        {typeof lead.score === "number" && (
          <span className={`shrink-0 text-sm font-bold ${SCORE_COL(lead.score)}`}>{lead.score}</span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {prio && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${prio.cls}`}>{prio.label}</span>}
        {lead.riesgo && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-black/[0.06] ${RIESGO_COL[lead.riesgo] ?? "text-text-muted"}`}>
            {lead.riesgo}
          </span>
        )}
        {lead.duplicado && <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">Duplicado</span>}
        <span className="ml-auto text-[11px] text-text-muted">{lead.estado}</span>
      </div>
    </button>
  );
}

const TABS = ["Principal", "Actualizaciones", "Análisis IA", "Archivos"] as const;
type Tab = (typeof TABS)[number];

function MiniCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-black/[0.02] p-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color ?? "text-text"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-muted">{sub}</p>}
    </div>
  );
}

function ResumenIA({ data }: { data: LeadAnalysis }) {
  const { lead, form, call } = data;
  const vehiculos = Array.from(new Set([
    form?.vehiculoInteres, ...(call?.vehiculosMencionados ?? [])
  ].filter((v): v is string => Boolean(v))));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-black/[0.02] p-3">
          <p className="text-[11px] text-text-muted">Score del lead</p>
          <p className={`mt-1 text-lg font-bold ${lead?.score != null ? SCORE_COL(lead.score) : "text-text"}`}>
            {lead?.score ?? "—"}<span className="text-xs text-text-muted">/100</span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
            <div className={`h-full rounded-full ${lead?.score != null ? SCORE_BAR(lead.score) : "bg-border"}`} style={{ width: `${lead?.score ?? 0}%` }} />
          </div>
        </div>
        <MiniCard label="Riesgo" value={cap(lead?.riesgo)} color={lead?.riesgo ? RIESGO_COL[lead.riesgo] : undefined}
          sub={`${lead?.rfc ? "RFC validado" : "RFC pendiente"}, ${lead?.duplicado ? "duplicado" : "sin duplicados"}`} />
        <MiniCard label="Empresa" value={lead?.razonSocial ? "Verificada" : "Persona física"} sub={lead?.razonSocial ?? "Sin razón social"} />
        <MiniCard label="Sentimiento llamada" value={call?.sentimiento ? cap(call.sentimiento) : "Sin llamada"}
          color={call?.sentimiento ? SENT_COL[call.sentimiento] : undefined}
          sub={call?.probabilidadCierre ? `Prob. cierre: ${call.probabilidadCierre}` : "—"} />
      </div>

      {(lead?.resumen || lead?.perfilEmpresa || form?.resumen) && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold"><FileText size={15} /> Resumen del lead</p>
          <p className="text-[13px] leading-relaxed text-text-muted">{lead?.resumen ?? form?.resumen ?? lead?.perfilEmpresa}</p>
        </div>
      )}

      {vehiculos.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><Truck size={15} /> Vehículos de interés</p>
          <div className="flex flex-wrap gap-2">
            {vehiculos.map((v) => (
              <span key={v} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent">{cap(v)}</span>
            ))}
          </div>
        </div>
      )}

      {(lead?.accionRecomendada || (lead?.siguientesPasos?.length ?? 0) > 0) && (
        <div className="rounded-lg border border-border p-4">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><CheckCircle2 size={15} /> Recomendaciones</p>
          {lead?.accionRecomendada && <p className="mb-2 text-[13px]"><span className="font-semibold text-accent">⚡ </span>{lead.accionRecomendada}</p>}
          <ul className="flex flex-col gap-1.5">
            {(lead?.siguientesPasos ?? []).slice(0, 4).map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />{p}</li>
            ))}
          </ul>
        </div>
      )}

      <Link to={`/monday/item?itemId=${data.itemId}`} className="flex items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/20">
        <ExternalLink size={15} /> Ver análisis completo
      </Link>
    </div>
  );
}

function DetailPanel({ itemId, region }: { itemId: string; region: LeadSummary["region"] | null }) {
  const [data, setData] = useState<LeadAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Análisis IA");
  const { activity, loading: loadingActivity } = useMondayActivity(itemId);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getLeadAnalysis(itemId).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [itemId]);

  const lead = data?.lead;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
          {data ? initials(data.itemName) : "—"}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold leading-tight">{data?.itemName ?? "Cargando…"}</h2>
          <p className="text-xs text-text-muted">Board: Leads MAXIRent · Grupo: Nuevos</p>
        </div>
        <span className="ml-auto rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">Activo</span>
      </div>

      <div className="flex gap-1 border-b border-border px-3">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] transition-colors ${
              tab === t ? "border-accent font-semibold text-accent" : "border-transparent text-text-muted hover:text-text"
            }`}>
            {t === "Análisis IA" && <Sparkles size={13} />}
            {t}
          </button>
        ))}
      </div>

      <div className="p-5">
        {loading && <p className="py-10 text-center text-sm text-text-muted">Cargando análisis…</p>}
        {!loading && error && <p className="py-10 text-center text-sm text-danger">{error}</p>}
        {!loading && !error && data && (
          <>
            {tab === "Principal" && (
              <PrincipalPanel
                itemName={data.itemName}
                email={lead?.email}
                telefono={lead?.telefono}
                rfc={lead?.rfc}
                razonSocial={lead?.razonSocial}
                region={region}
              />
            )}
            {tab === "Actualizaciones" && <ActualizacionesPanel activity={activity} loading={loadingActivity} />}
            {tab === "Archivos" && <ArchivosPanel activity={activity} loading={loadingActivity} />}
            {tab === "Análisis IA" && <ResumenIA data={data} />}
          </>
        )}
      </div>
    </div>
  );
}

export function MondayBoardView() {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.getLeads().then((d) => { setData(d); setSelected((cur) => cur ?? d.leads[0]?.itemId ?? null); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const leads = data?.leads ?? [];
  const stats = data?.stats;
  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    return !q || l.itemName.toLowerCase().includes(q) || (l.vehiculo ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">M</div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Análisis IA de leads</h1>
          <p className="text-xs text-text-muted">Vista que verían los vendedores embebida en cada item de Monday</p>
        </div>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      <div className="px-6 py-5">
        {error && <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Leads analizados" value={stats?.total ?? "—"} />
          <Kpi label="Score promedio" value={stats?.scorePromedio ?? "—"} />
          <Kpi label="Alto potencial" value={stats?.altoPotencial ?? "—"} color="text-success" />
          <Kpi label="Duplicados detectados" value={stats?.duplicados ?? "—"} color="text-danger" />
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">Cargando leads…</div>
        ) : leads.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-16 text-center">
            <div className="mb-3 flex justify-center text-text-muted opacity-40"><Sparkles size={36} /></div>
            <p className="text-sm font-medium text-text-muted">No hay leads analizados aún</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
            <div className="flex flex-col gap-2">
              <input type="text" placeholder="Buscar lead…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
              <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
                {filtered.map((l) => <LeadRow key={l.itemId} lead={l} active={l.itemId === selected} onClick={() => setSelected(l.itemId)} />)}
                {filtered.length === 0 && <p className="py-6 text-center text-sm text-text-muted">Sin resultados.</p>}
              </div>
            </div>
            {selected ? <DetailPanel itemId={selected} region={leads.find((l) => l.itemId === selected)?.region ?? null} /> : (
              <div className="rounded-xl border border-border bg-surface p-16 text-center text-sm text-text-muted">Selecciona un lead para ver su análisis.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
