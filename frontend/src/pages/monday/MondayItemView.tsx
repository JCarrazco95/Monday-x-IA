import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { getMondayContext } from "../../lib/mondaySDK";
import type { LeadAnalysis, CompanyResearch, ScoreFactor, CallsResponse, AnalyzedCallListItem, CallAnalysisData } from "../../types";
import { CallAnalysisTabs } from "../../components/CallAnalysisTabs";
import { Search, BarChart3, ClipboardList, Compass, HelpCircle, Flag, Phone, PhoneCall, PhoneOff, Mail, Sparkles } from "lucide-react";

// ===========================================================================
//  Item View para Monday.com — Análisis completo de un lead.
//  Se embebe como iframe al abrir un item del tablero.
//  Detecta el itemId desde el SDK de Monday o desde ?itemId= en la URL.
// ===========================================================================

// ─── helpers de estilo ──────────────────────────────────────────────────────
const SCORE_COL = (s: number) => s >= 75 ? "text-success" : s >= 50 ? "text-warning" : "text-danger";

const PRIO_STYLE: Record<string, string> = {
  caliente: "bg-danger/20 text-danger border border-danger/30",
  tibia:    "bg-warning/20 text-warning border border-warning/30",
  fria:     "bg-info/20 text-info border border-info/30"
};
const PRIO_LABEL: Record<string, string> = { caliente: "Caliente 🔥", tibia: "Tibia", fria: "Fría ❄" };

const RIESGO_COL: Record<string, string> = { bajo: "text-success", medio: "text-warning", alto: "text-danger" };
const RIESGO_BG:  Record<string, string> = { bajo: "bg-success/15", medio: "bg-warning/15", alto: "bg-danger/15" };

const CONF_COL: Record<string, string> = { alta: "text-success", media: "text-warning", baja: "text-text-muted" };

function cap(s?: string | null) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
}
function fmt(ts: string | null) {
  if (!ts) return "";
  const diffMs = Date.now() - new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.round(h / 24)}d`;
}

// ─── sub-componentes ─────────────────────────────────────────────────────────

function Section({ title, icon, children, accent }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-accent/30 bg-accent/[0.04]" : "border-border"}`}>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <span>{icon}</span>{title}
      </h3>
      {children}
    </div>
  );
}

function Pill({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[12px] font-medium ${cls ?? "bg-black/[0.06] text-text-muted"}`}>
      {children}
    </span>
  );
}

function ScoreFactorRow({ f }: { f: ScoreFactor }) {
  const pct = f.max > 0 ? Math.round((f.puntos / f.max) * 100) : 0;
  const bar = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-text">{f.factor}</span>
        <span className="font-semibold text-text-muted">{f.puntos}/{f.max}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      {f.justificacion && (
        <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{f.justificacion}</p>
      )}
    </div>
  );
}

function TwoColList({ icon, title, items, color }: { icon: string; title: string; items: string[]; color: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-[12px] font-semibold">{icon} {title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className={`flex items-start gap-1.5 text-[13px] ${color}`}>
            <span className="mt-0.5 shrink-0">•</span><span className="text-text">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CanalRow({ icon, label, url, resumen }: {
  icon: string; label: string; url?: string | null; resumen?: string | null;
}) {
  if (!url && !resumen) return null;
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold">
        <span>{icon}</span>
        <span>{label}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="ml-auto text-accent hover:underline">
            Abrir ↗
          </a>
        )}
      </div>
      {url && <p className="mt-1 truncate text-[11px] text-info">{url}</p>}
      {resumen && <p className="mt-1 text-[12px] leading-snug text-text-muted">{resumen}</p>}
    </div>
  );
}

function PresenciaDigital({ pd }: { pd: CompanyResearch["presenciaDigital"] }) {
  const redes = pd.redes ?? [];
  const hasAny = Boolean(pd.web?.url) || Boolean(pd.linkedin?.url) || redes.length > 0 || Boolean(pd.notas);
  if (!hasAny) return null;
  return (
    <div className="mb-4">
      <p className="mb-2 text-[12px] font-semibold">🌐 Presencia digital</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CanalRow icon="🌐" label="Sitio web" url={pd.web?.url} resumen={pd.web?.resumen} />
        <CanalRow icon="in" label="LinkedIn (empresa)" url={pd.linkedin?.url} resumen={pd.linkedin?.resumen} />
        {redes.map((red, i) => (
          <CanalRow key={i} icon="📱" label={red.red} url={red.url} resumen={red.resumen} />
        ))}
      </div>
      {pd.notas && <p className="mt-2 text-[11px] italic text-text-muted">{pd.notas}</p>}
    </div>
  );
}

function ResearchBlock({ r, fuente, previo }: {
  r: CompanyResearch;
  fuente: "web" | "modelo" | "demo" | null;
  previo: boolean;
}) {
  const fuenteLabel = fuente === "web" ? "Búsqueda web" : fuente === "modelo" ? "Conocimiento del modelo" : "Demo";
  return (
    <Section icon={<Search size={15} />} title="Investigación de la empresa" accent>
      {/* Meta */}
      <div className="mb-3 flex items-center gap-2 flex-wrap text-[11px] text-text-muted">
        <span className={`font-semibold ${CONF_COL[r.confianza]}`}>confianza {r.confianza}</span>
        <span>·</span>
        <span>{fuenteLabel}</span>
        {previo && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">conocimiento previo reutilizado</span>}
      </div>

      {/* Sector + meta tags */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {r.sectores.map((s) => <Pill key={s} cls="bg-accent/10 text-accent">{s}</Pill>)}
        {r.giroPrincipal && r.giroPrincipal !== r.sectores[0] && <Pill>{r.giroPrincipal}</Pill>}
        {r.tamanoEstimado && <Pill>🏢 {r.tamanoEstimado}</Pill>}
        {r.ubicacion && <Pill>📍 {r.ubicacion}</Pill>}
      </div>

      {/* Debilidades + Oportunidades */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {r.debilidades.length > 0 && (
          <TwoColList icon="⚠️" title="Debilidades del cliente" items={r.debilidades} color="text-warning" />
        )}
        {r.oportunidadesMaxirent.length > 0 && (
          <TwoColList icon="✅" title="Qué le resuelve MAXIRent" items={r.oportunidadesMaxirent} color="text-success" />
        )}
      </div>

      {/* Necesidad vehicular */}
      {r.necesidadVehicular && (
        <p className="mb-3 text-[13px]">
          <span className="text-text-muted">🚚 Flota sugerida: </span>
          <span className="font-medium text-text">{r.necesidadVehicular}</span>
        </p>
      )}

      {/* Competencia + Gobierno */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill cls={r.rentaOtrasMarcas.detectado ? "bg-danger/15 text-danger" : "bg-black/[0.06] text-text-muted"}>
          🏁 Competencia:{" "}
          {r.rentaOtrasMarcas.detectado
            ? (r.rentaOtrasMarcas.detalle ?? (r.rentaOtrasMarcas.competidores ?? []).join(", ")) || "Detectada"
            : "No detectada"}
        </Pill>
        <Pill cls={r.gobierno.tieneContratos ? "bg-info/15 text-info" : "bg-black/[0.06] text-text-muted"}>
          🏛️ Gobierno:{" "}
          {r.gobierno.tieneContratos ? r.gobierno.detalle ?? "Con contratos" : "Sin contratos detectados"}
        </Pill>
      </div>

      {/* Argumentario */}
      {r.argumentarioVenta.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface/60 p-3">
          <p className="mb-2 text-[12px] font-semibold text-accent">💬 Argumentario de venta</p>
          <ul className="flex flex-col gap-1.5">
            {r.argumentarioVenta.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 shrink-0 text-accent">▸</span>{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Presencia digital — link + información encontrada por canal */}
      <PresenciaDigital pd={r.presenciaDigital} />

      {/* Fuentes */}
      {r.fuentes.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-text-muted">Fuentes consultadas</p>
          <div className="flex flex-col gap-0.5">
            {r.fuentes.map((f, i) => (
              <a
                key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                className="truncate text-[12px] text-info hover:underline"
              >
                🔗 {f.titulo}
              </a>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── vista principal ─────────────────────────────────────────────────────────

function fmtCallDate(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function CallLog({ telefono }: { telefono?: string | null }) {
  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const tel = (telefono ?? "").replace(/[^0-9+]/g, "");

  useEffect(() => {
    if (!telefono) return;
    setLoading(true);
    api.getCalls(telefono).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [telefono]);

  return (
    <Section icon={<Phone size={15} />} title="Registro de llamadas">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12px] text-text-muted">Historial con el cliente vía Aircall</p>
        {tel ? (
          <a href={`tel:${tel}`} className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90">
            <PhoneCall size={15} /> Llamar
          </a>
        ) : (
          <span className="text-[12px] text-text-muted">Sin teléfono registrado</span>
        )}
      </div>

      {loading && <p className="py-4 text-center text-[13px] text-text-muted">Cargando llamadas…</p>}

      {!loading && (!data || data.calls.length === 0) && (
        <p className="py-4 text-center text-[13px] text-text-muted">
          {data && !data.enabled
            ? "Conecta Aircall (credenciales en el backend) para ver el historial de llamadas."
            : "Sin llamadas registradas con este cliente."}
        </p>
      )}

      {!loading && data && data.calls.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {data.calls.map((c) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center gap-2 rounded-md border-l-4 px-3 py-2 text-[13px] ${
                c.answered ? "border-success bg-success/[0.06]" : "border-danger bg-danger/[0.06]"
              }`}
            >
              <span className={c.answered ? "text-success" : "text-danger"}>
                {c.answered ? <PhoneCall size={15} /> : <PhoneOff size={15} />}
              </span>
              <span className="font-medium text-text">{c.direction === "inbound" ? "Entrante" : "Saliente"}</span>
              <span className="text-text-muted">{fmtCallDate(c.startedAt)}</span>
              {c.usuario && <span className="text-[11px] text-text-muted">· {c.usuario}</span>}
              <span className={`ml-auto font-semibold ${c.answered ? "text-success" : "text-danger"}`}>
                {c.answered ? `Contestada · ${Math.max(1, Math.round(c.durationSec / 60))} min` : "No contestada"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const G_BAND: Record<string, string> = { verde: "text-success", amarillo: "text-warning", rojo: "text-danger" };

function CallHistory({ telefono, fallback }: { telefono: string | null; fallback: CallAnalysisData | null }) {
  const [list, setList] = useState<AnalyzedCallListItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [selCall, setSelCall] = useState<CallAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!telefono) { setList([]); return; }
    setLoading(true);
    api.getAnalyzedCalls(telefono)
      .then((r) => { setList(r.calls); if (r.calls.length) setSel(r.calls[0].itemId); })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [telefono]);

  useEffect(() => {
    if (!sel) { setSelCall(null); return; }
    api.getAnalyzedCall(sel).then((d) => setSelCall(d.call)).catch(() => setSelCall(null));
  }, [sel]);

  if (loading) return <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-text-muted">Cargando llamadas…</p>;

  // Sin historial por telefono → usa la llamada de este item (fallback).
  if (list.length === 0) {
    return fallback
      ? <CallAnalysisTabs call={fallback} />
      : <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-text-muted">Aún no hay análisis de llamada para este lead. Usa el botón “Llamar” para contactarlo.</p>;
  }

  const current = selCall;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="mb-2 text-[12px] font-semibold text-text-muted">Llamadas de este lead ({list.length})</p>
        <div className="flex flex-col gap-1.5">
          {list.map((c) => (
            <button
              key={c.itemId}
              onClick={() => setSel(c.itemId)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-colors ${sel === c.itemId ? "border-accent bg-accent/[0.05]" : "border-border hover:bg-black/[0.02]"}`}
            >
              <span className="font-mono text-accent">{c.idLlamada}</span>
              <span className="text-text-muted">{c.fecha ? fmt(c.fecha) : "—"}</span>
              {c.globalScore != null && c.globalBanda && (
                <span className={`ml-auto font-semibold ${G_BAND[c.globalBanda] ?? "text-text"}`}>{c.globalScore}/100</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {current
        ? <CallAnalysisTabs call={current} />
        : <p className="rounded-xl border border-border bg-surface p-6 text-center text-[13px] text-text-muted">Cargando análisis…</p>}
    </div>
  );
}

export function AnalysisBody({ a }: { a: LeadAnalysis }) {
  const { lead, form, call } = a;
  const [tab, setTab] = useState<"ia" | "call">("ia");

  const initials = a.itemName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const score = lead?.score;
  const band = score != null ? (score >= 75 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger") : "bg-border";

  const vehiculos = Array.from(new Set([
    form?.vehiculoInteres,
    ...(call?.vehiculosMencionados ?? [])
  ].filter((v): v is string => Boolean(v))));

  return (
    <div className="flex flex-col gap-4">

      {/* ── Hero ── */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-lg font-bold text-white">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold leading-tight">
              {a.itemName}
              {lead?.razonSocial ? <span className="text-text-muted"> — {lead.razonSocial}</span> : ""}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {lead?.email && <span className="text-xs text-text-muted">{lead.email}</span>}
              {lead?.rfc && <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-[11px] text-text-muted">RFC: {lead.rfc}</span>}
              {lead?.fuenteAnalisis && (
                <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-[11px] text-text-muted">
                  fuente: {lead.fuenteAnalisis}
                </span>
              )}
              {a.updatedAt && (
                <span className="ml-auto text-[11px] text-text-muted">{fmt(a.updatedAt)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Score + badges */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {score != null && (
            <div className="flex items-center gap-3">
              <div className={`text-4xl font-bold ${SCORE_COL(score)}`}>
                {score}
                <span className="text-base font-semibold text-text-muted">/100</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-black/10">
                  <div className={`h-full rounded-full ${band} transition-all duration-700`} style={{ width: `${score}%` }} />
                </div>
                <p className="text-[11px] text-text-muted">Score Sandler · modelo IA</p>
              </div>
            </div>
          )}
          {lead?.prioridad && (
            <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${PRIO_STYLE[lead.prioridad]}`}>
              {PRIO_LABEL[lead.prioridad]}
            </span>
          )}
          {lead?.riesgo && (
            <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${RIESGO_BG[lead.riesgo]} ${RIESGO_COL[lead.riesgo]}`}>
              Riesgo {lead.riesgo}
            </span>
          )}
          {lead?.duplicado && (
            <span className="rounded-full bg-danger/15 px-3 py-1 text-[12px] font-semibold text-danger">
              ⚠ Duplicado{lead.duplicadoRef ? ` de ${lead.duplicadoRef}` : ""}
            </span>
          )}
        </div>

        {/* Perfil empresa */}
        {lead?.perfilEmpresa && (
          <p className="mt-3 text-[13px] text-text-muted">{lead.perfilEmpresa}</p>
        )}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setTab("ia")} className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] transition-colors ${tab === "ia" ? "border-accent font-semibold text-accent" : "border-transparent text-text-muted hover:text-text"}`}>
          <Sparkles size={14} /> Análisis IA
        </button>
        <button onClick={() => setTab("call")} className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] transition-colors ${tab === "call" ? "border-accent font-semibold text-accent" : "border-transparent text-text-muted hover:text-text"}`}>
          <Phone size={14} /> Call Intelligence
        </button>
      </div>

      {tab === "ia" && (
      <div className="flex flex-col gap-4">

      {/* ── Acción inmediata ── */}
      {lead?.accionRecomendada && (
        <div className="rounded-xl border border-success/40 bg-success/[0.07] p-4">
          <p className="mb-1 text-[12px] font-semibold text-success">⚡ Acción inmediata</p>
          <p className="text-[14px] font-medium text-text">{lead.accionRecomendada}</p>
        </div>
      )}


      {/* ── Score breakdown ── */}
      {lead && lead.scoreBreakdown.length > 0 && (
        <Section icon={<BarChart3 size={15} />} title={`Desglose del score — ${lead.score}/100`}>
          <div className="flex flex-col gap-3">
            {lead.scoreBreakdown.map((f, i) => <ScoreFactorRow key={i} f={f} />)}
          </div>
        </Section>
      )}

      {/* ── Investigación de empresa ── */}
      {lead?.research && (
        <ResearchBlock r={lead.research} fuente={lead.fuenteAnalisis} previo={lead.conocimientoPrevio} />
      )}

      {/* ── Formulario + vehículos ── */}
      {(form || vehiculos.length > 0) && (
        <Section icon={<ClipboardList size={15} />} title="Datos del formulario">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
            {form?.tipoCliente && (
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[11px] text-text-muted">Tipo cliente</p>
                <p className="mt-0.5 font-semibold text-[13px]">{cap(form.tipoCliente)}</p>
              </div>
            )}
            {form?.urgencia && (
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[11px] text-text-muted">Urgencia</p>
                <p className={`mt-0.5 font-semibold text-[13px] ${form.urgencia === "alta" ? "text-danger" : form.urgencia === "media" ? "text-warning" : "text-text"}`}>
                  {cap(form.urgencia)}
                </p>
              </div>
            )}
            {form?.duracionRenta && (
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[11px] text-text-muted">Duración renta</p>
                <p className="mt-0.5 font-semibold text-[13px]">{form.duracionRenta}</p>
              </div>
            )}
            <div className="rounded-lg border border-border p-2.5">
              <p className="text-[11px] text-text-muted">Disponible en flota</p>
              <p className={`mt-0.5 font-semibold text-[13px] ${form?.disponibleEnFlota ? "text-success" : "text-warning"}`}>
                {form?.disponibleEnFlota ? "Sí" : "Verificar"}
              </p>
            </div>
          </div>

          {vehiculos.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Vehículos de interés</p>
              <div className="flex flex-wrap gap-2">
                {vehiculos.map((v) => (
                  <span key={v} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent">
                    {cap(v)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {form?.resumen && (
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">{form.resumen}</p>
          )}
        </Section>
      )}

      {/* ── Playbook ── */}
      {lead && lead.siguientesPasos.length > 0 && (
        <Section icon={<Compass size={15} />} title="Playbook de venta — Siguientes pasos">
          <ol className="flex flex-col gap-2">
            {lead.siguientesPasos.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-[13px] text-text">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* ── Discovery ── */}
      {lead && lead.preguntasDiscovery.length > 0 && (
        <Section icon={<HelpCircle size={15} />} title="Preguntas para la primera llamada">
          <ul className="flex flex-col gap-2">
            {lead.preguntasDiscovery.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text">
                <span className="mt-0.5 shrink-0 text-accent">▸</span>{q}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Riesgos comerciales ── */}
      {lead && lead.riesgosComerciales.length > 0 && (
        <Section icon={<Flag size={15} />} title="Riesgos a vigilar">
          <ul className="flex flex-col gap-1.5">
            {lead.riesgosComerciales.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 shrink-0 text-warning">•</span>
                <span className="text-text">{r}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Respuesta sugerida al formulario ── */}
      {form?.plantillaRespuesta && (
        <Section icon={<Mail size={15} />} title="Plantilla de respuesta al prospecto">
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-bg/60 px-4 py-3 text-[13px] leading-relaxed text-text">
            {form.plantillaRespuesta}
          </div>
        </Section>
      )}

      </div>
      )}

      {tab === "call" && (
      <div className="flex flex-col gap-4">
        <CallLog telefono={lead?.telefono ?? call?.telefono ?? null} />
        <CallHistory telefono={lead?.telefono ?? call?.telefono ?? null} fallback={call} />
      </div>
      )}

      {/* Footer */}
      <div className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-[11px] text-text-muted flex items-center justify-between">
        <span>
          <span className="text-accent">✦</span> Agentes: {a.agents.join(" + ") || "IA MAXIRent"}
        </span>
        <span>Item #{a.itemId} · {a.updatedAt ? fmt(a.updatedAt) : "—"}</span>
      </div>
    </div>
  );
}

// ─── shell: detecta itemId y carga datos ─────────────────────────────────────

export function MondayItemView() {
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);

  useEffect(() => {
    getMondayContext().then((ctx) => {
      const id = ctx?.itemId ?? new URLSearchParams(window.location.search).get("itemId");
      setItemId(id);
      if (!id) {
        setLoading(false);
        return;
      }
      api.getLeadAnalysis(id)
        .then(setAnalysis)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header fijo */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/90 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-2 text-xs font-bold text-white">M</div>
          <span className="text-sm font-semibold">MAXIRent · Análisis IA del lead</span>
          {analysis && (
            <span className="ml-auto font-mono text-[11px] text-text-muted">#{analysis.itemId}</span>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mb-3 text-3xl animate-pulse text-accent">✦</div>
              <p className="text-sm text-text-muted">Cargando análisis IA…</p>
            </div>
          </div>
        )}

        {!loading && error && /no encontrado|sin an[aá]lisis/i.test(error) && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <p className="text-2xl mb-3">✨</p>
            <p className="text-sm font-medium text-text">Este lead aún no tiene análisis IA</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-text-muted">
              El análisis se genera automáticamente cuando el lead se procesa (webhook al crear el item, o desde el panel
              con “Simular/Analizar”). Vuelve a abrir esta vista cuando el lead haya sido analizado.
            </p>
          </div>
        )}

        {!loading && error && !/no encontrado|sin an[aá]lisis/i.test(error) && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center">
            <p className="text-sm font-medium text-danger">Error al cargar el análisis</p>
            <p className="mt-1 text-xs text-text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && !itemId && (
          <div className="rounded-xl border border-border bg-surface p-10 text-center">
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-sm font-medium text-text-muted">Abre este view desde un item de Monday.com</p>
            <p className="mt-1 text-xs text-text-muted">
              O agrega <code className="rounded bg-black/10 px-1 py-0.5">?itemId=ITEM_ID</code> a la URL para probar en local.
            </p>
          </div>
        )}

        {!loading && !error && analysis && <AnalysisBody a={analysis} />}
      </div>
    </div>
  );
}
