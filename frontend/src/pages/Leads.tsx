import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { LeadAnalysis, LeadSummary, LeadsResponse, CompanyResearch, ScoreFactor, Region } from "../types";
import { REGIONES } from "../types";
import { useMondayActivity, PrincipalPanel, ActualizacionesPanel, ArchivosPanel } from "../components/MondayExtraTabs";

const RIESGO_STYLES: Record<string, string> = {
  bajo: "bg-success/15 text-success",
  medio: "bg-warning/15 text-warning",
  alto: "bg-danger/15 text-danger"
};
const SENT_STYLES: Record<string, string> = {
  positivo: "text-success",
  neutro: "text-warning",
  negativo: "text-danger"
};
const PRIO_STYLES: Record<string, string> = {
  caliente: "bg-danger/20 text-danger",
  tibia: "bg-warning/20 text-warning",
  fria: "bg-info/20 text-info"
};

export function Leads() {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [region, setRegion] = useState<Region | "">("");
  const [minScore, setMinScore] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced

  // Sync del tablero (red de seguridad si el webhook nativo no está registrado)
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadList = useCallback(async () => {
    try {
      const res = await api.getLeads({
        region: region || null,
        minScore: minScore ? Number(minScore) : null,
        search
      });
      setData(res);
      setError(null);
      setSelected((prev) => prev ?? res.leads[0]?.itemId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [region, minScore, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) {
      setAnalysis(null);
      return;
    }
    setLoadingDetail(true);
    api
      .getLeadAnalysis(selected)
      .then(setAnalysis)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      await api.syncLeadsBoard();
      // El sync corre en segundo plano (puede tardar); se consulta el estado hasta que termine.
      for (;;) {
        const s = await api.getLeadsSyncStatus();
        if (!s.running) {
          if (s.error) setSyncMsg(`Error: ${s.error}`);
          else if (s.result) {
            setSyncMsg(
              s.result.analizados > 0
                ? `✓ ${s.result.analizados} lead(s) nuevo(s) analizado(s) (${s.result.yaAnalizados} ya estaban al día).`
                : `Sin leads nuevos — ${s.result.yaAnalizados} ya estaban analizados de ${s.result.leidos} en el tablero.`
            );
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      await loadList();
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <div className="text-text-muted">Cargando análisis IA...</div>;

  const leads = data?.leads ?? [];
  const stats = data?.stats;
  const selectedSummary = leads.find((l) => l.itemId === selected) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Análisis IA de leads</h1>
          <p className="text-sm text-text-muted">
            Vista que verían los vendedores embebida en cada item de Monday
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Revisa el tablero de Monday y analiza los leads nuevos que no llegaron por webhook"
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-60"
          >
            {syncing ? "Sincronizando…" : "⇅ Sincronizar tablero"}
          </button>
          <button
            onClick={loadList}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-black/[0.04] hover:text-text"
          >
            ↻ Actualizar
          </button>
        </div>
      </header>

      {syncMsg && (
        <div className="rounded-lg border border-accent/30 bg-accent/[0.06] px-4 py-2 text-sm text-text">
          {syncMsg}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniKpi label="Leads analizados" value={stats.total} />
          <MiniKpi label="Score promedio" value={stats.scorePromedio} />
          <MiniKpi label="Alto potencial" value={stats.altoPotencial} accent="success" />
          <MiniKpi label="Duplicados detectados" value={stats.duplicados} accent={stats.duplicados ? "danger" : undefined} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por nombre o vehículo…"
          className="h-9 min-w-[220px] rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as Region | "")}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">Todas las regiones</option>
          {REGIONES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">Cualquier score</option>
          <option value="70">Score ≥ 70</option>
          <option value="50">Score ≥ 50</option>
          <option value="30">Score ≥ 30</option>
        </select>
        {(region || minScore || search) && (
          <button
            onClick={() => { setRegion(""); setMinScore(""); setSearchInput(""); }}
            className="text-sm text-text-muted hover:text-text"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-text-muted">
          {region || minScore || search
            ? "Ningún lead coincide con estos filtros."
            : (
              <>
                Aún no hay leads analizados. Ve al <span className="text-accent">Dashboard</span> y usa
                <span className="text-accent"> “Simular lead”</span> para generar uno, o usa “Sincronizar tablero”
                si ya tienes leads creados en Monday.
              </>
            )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          {/* Lista de leads */}
          <div className="flex flex-col gap-2">
            {leads.map((l) => (
              <LeadRow
                key={l.itemId}
                lead={l}
                active={l.itemId === selected}
                onClick={() => setSelected(l.itemId)}
              />
            ))}
          </div>

          {/* Vista de item */}
          <div>
            {loadingDetail || !analysis ? (
              <div className="rounded-xl border border-border bg-surface p-10 text-center text-text-muted">
                Cargando...
              </div>
            ) : (
              <ItemView analysis={analysis} region={selectedSummary?.region ?? null} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, active, onClick }: { lead: LeadSummary; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        active ? "border-accent/60 bg-accent/10" : "border-border hover:bg-black/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{lead.itemName}</span>
        {typeof lead.score === "number" && (
          <span className="text-sm font-semibold">{lead.score}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lead.prioridad && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIO_STYLES[lead.prioridad] ?? "bg-black/10 text-text-muted"}`}>
            {lead.prioridad}
          </span>
        )}
        {lead.riesgo && (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${RIESGO_STYLES[lead.riesgo] ?? "bg-black/10 text-text-muted"}`}>
            {cap(lead.riesgo)}
          </span>
        )}
        {lead.duplicado && (
          <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-danger/15 text-danger">Duplicado</span>
        )}
        {lead.region && lead.region !== "Otra" && (
          <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-black/[0.06] text-text-muted">📍 {lead.region}</span>
        )}
        <span className="ml-auto text-[11px] text-text-muted">{lead.estado}</span>
      </div>
    </button>
  );
}

const TABS = ["Principal", "Actualizaciones", "Análisis IA", "Archivos"] as const;
type Tab = (typeof TABS)[number];

function ItemView({ analysis, region }: { analysis: LeadAnalysis; region: Region | null }) {
  const { lead, form, call } = analysis;
  const [tab, setTab] = useState<Tab>("Análisis IA");
  const { activity, loading: loadingActivity } = useMondayActivity(analysis.itemId);
  const initials = analysis.itemName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const empresaTitle = lead?.razonSocial ?? form?.tipoCliente === "empresarial" ? "Verificada" : "Persona física";
  const vehiculos = [
    form?.vehiculoInteres,
    ...(call?.vehiculosMencionados ?? [])
  ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);

  const acciones = [
    lead?.accionRecomendada,
    form?.disponibleEnFlota ? "Agendar visita a flotilla disponible" : null,
    ...(call?.compromisos ?? []).map((c) => `${c.descripcion} (${c.responsable})`)
  ].filter((a): a is string => Boolean(a));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
          {initials}
        </div>
        <div>
          <div className="text-[15px] font-semibold">
            {analysis.itemName}
            {lead?.razonSocial ? ` — ${lead.razonSocial}` : ""}
          </div>
          <div className="text-xs text-text-muted">Board: Leads MAXIRent · Grupo: Nuevos</div>
        </div>
        <span className="ml-auto rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
          Activo
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border bg-black/[0.02] px-3">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-[13px] transition-colors ${
              tab === t
                ? "border-b-2 border-accent font-semibold text-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            {t === "Análisis IA" ? "✦ Análisis IA" : t}
          </button>
        ))}
      </div>

      {tab === "Principal" && (
        <div className="p-5">
          <PrincipalPanel
            itemName={analysis.itemName}
            email={lead?.email}
            telefono={lead?.telefono}
            rfc={lead?.rfc}
            razonSocial={lead?.razonSocial}
            region={region}
          />
        </div>
      )}

      {tab === "Actualizaciones" && (
        <div className="p-5">
          <ActualizacionesPanel activity={activity} loading={loadingActivity} />
        </div>
      )}

      {tab === "Archivos" && (
        <div className="p-5">
          <ArchivosPanel activity={activity} loading={loadingActivity} />
        </div>
      )}

      {/* Body */}
      {tab === "Análisis IA" && (
      <div className="flex flex-col gap-4 p-5">
        {/* Métricas */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Score del lead">
            <div className="flex items-baseline gap-2">
              <div className={`text-xl font-bold ${scoreColor(lead?.score)}`}>
                {lead?.score ?? "—"}
                <span className="text-xs font-medium text-text-muted">/100</span>
              </div>
              {lead?.prioridad && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIO_STYLES[lead.prioridad]}`}>
                  {lead.prioridad}
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
              <div className={`h-full rounded-full ${scoreBar(lead?.score)}`} style={{ width: `${lead?.score ?? 0}%` }} />
            </div>
          </Metric>
          <Metric label="Riesgo">
            <div className={`text-xl font-bold ${riskColor(lead?.riesgo)}`}>{cap(lead?.riesgo ?? "—")}</div>
            <div className="text-[11px] text-text-muted">
              {lead?.duplicado ? `Posible duplicado de ${lead.duplicadoRef ?? "otro lead"}` : "RFC validado, sin duplicados"}
            </div>
          </Metric>
          <Metric label="Empresa">
            <div className="text-xl font-bold">{empresaTitle}</div>
            <div className="text-[11px] text-text-muted">
              {lead?.razonSocial ? "Razón social coincide" : "Sin razón social"}
            </div>
          </Metric>
          <Metric label="Sentimiento llamada">
            <div className={`text-xl font-bold ${SENT_STYLES[call?.sentimiento ?? ""] ?? "text-text-muted"}`}>
              {call?.sentimiento ? cap(call.sentimiento) : "Sin llamada"}
            </div>
            <div className="text-[11px] text-text-muted">
              {call?.probabilidadCierre ? `Prob. cierre: ${call.probabilidadCierre}` : "—"}
            </div>
          </Metric>
        </div>

        {/* Desglose del score */}
        {lead && lead.scoreBreakdown.length > 0 && (
          <Block icon="📊" title={`Desglose del score — ${lead.score}/100`}>
            <div className="flex flex-col gap-2.5">
              {lead.scoreBreakdown.map((f, i) => (
                <ScoreFactorRow key={i} f={f} />
              ))}
            </div>
          </Block>
        )}

        {/* Resumen */}
        {(lead?.resumen || lead?.perfilEmpresa || form?.resumen || call?.resumen) && (
          <Block icon="📄" title="Resumen del lead">
            <p className="text-[13px] leading-relaxed text-text">
              {lead?.perfilEmpresa ?? lead?.resumen ?? form?.resumen ?? call?.resumen}
            </p>
            {call?.resumen && lead?.perfilEmpresa && (
              <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{call.resumen}</p>
            )}
          </Block>
        )}

        {/* Investigación de empresa */}
        {lead?.research && <ResearchSection r={lead.research} fuente={lead.fuenteAnalisis} previo={lead.conocimientoPrevio} />}

        {/* Vehículos */}
        {vehiculos.length > 0 && (
          <Block icon="🚚" title="Vehículos de interés">
            <div className="flex flex-wrap gap-2">
              {vehiculos.map((v) => (
                <span key={v} className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-[12px] font-medium text-accent">
                  {cap(v)}
                </span>
              ))}
            </div>
          </Block>
        )}

        {/* Objeciones */}
        {call?.objeciones && call.objeciones.length > 0 && (
          <Block icon="⚠" title="Objeciones detectadas">
            <ul className="flex flex-col gap-1">
              {call.objeciones.map((o, i) => (
                <li key={i} className="text-[13px] text-warning">• {o}</li>
              ))}
            </ul>
          </Block>
        )}

        {/* Acción inmediata destacada */}
        {lead?.accionRecomendada && (
          <div className="rounded-xl border border-success/40 bg-success/[0.07] p-4">
            <div className="mb-1 text-[12px] font-semibold text-success">⚡ Acción inmediata</div>
            <p className="text-[14px] text-text">{lead.accionRecomendada}</p>
          </div>
        )}

        {/* Playbook de venta */}
        {lead && lead.siguientesPasos.length > 0 && (
          <Block icon="🧭" title="Siguientes pasos (playbook)">
            <ol className="flex flex-col gap-1.5">
              {lead.siguientesPasos.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] text-text">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">{i + 1}</span>
                  {p}
                </li>
              ))}
            </ol>
          </Block>
        )}

        {/* Preguntas discovery */}
        {lead && lead.preguntasDiscovery.length > 0 && (
          <Block icon="❓" title="Preguntas para la primera llamada">
            <ul className="flex flex-col gap-1.5">
              {lead.preguntasDiscovery.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-text"><span className="mt-0.5 text-accent">▸</span>{q}</li>
              ))}
            </ul>
          </Block>
        )}

        {/* Riesgos comerciales */}
        {lead && lead.riesgosComerciales.length > 0 && (
          <Block icon="🚩" title="Riesgos a vigilar">
            <ul className="flex flex-col gap-1">
              {lead.riesgosComerciales.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-warning"><span className="mt-0.5">•</span><span className="text-text">{r}</span></li>
              ))}
            </ul>
          </Block>
        )}

        {/* Acciones combinadas (research + form + call) */}
        {acciones.length > 0 && (
          <Block icon="✓" title="Recomendaciones adicionales">
            <ul className="flex flex-col gap-1.5">
              {acciones.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-text">
                  <span className="mt-0.5 text-success">✔</span>
                  {a}
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border bg-black/[0.02] px-5 py-3 text-xs text-text-muted">
        <span>
          <span className="text-accent">✦</span> Generado por {analysis.agents.join(" + ") || "los agentes IA"}
        </span>
        <span>{formatRelative(analysis.updatedAt)}</span>
      </div>
    </div>
  );
}

function ResearchSection({
  r,
  fuente,
  previo
}: {
  r: CompanyResearch;
  fuente: "web" | "modelo" | "demo" | null;
  previo: boolean;
}) {
  const confColor =
    r.confianza === "alta" ? "text-success" : r.confianza === "media" ? "text-warning" : "text-text-muted";
  const fuenteLabel = fuente === "web" ? "Búsqueda web" : fuente === "modelo" ? "Conocimiento del modelo" : "Demo";
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.04] p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
        <span>🔎</span> Investigación de la empresa
        <span className="ml-auto flex items-center gap-2 text-[11px] font-normal text-text-muted">
          <span className={confColor}>confianza {r.confianza}</span>
          <span>· {fuenteLabel}</span>
          {previo && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">conocimiento previo</span>}
        </span>
      </h3>

      <div className="mb-3 flex flex-wrap gap-2">
        {r.sectores.map((s) => (
          <span key={s} className="rounded-lg bg-black/[0.06] px-2.5 py-1 text-[12px] font-medium">{s}</span>
        ))}
        {r.tamanoEstimado && <span className="rounded-lg bg-black/[0.06] px-2.5 py-1 text-[12px] text-text-muted">{r.tamanoEstimado}</span>}
        {r.ubicacion && <span className="rounded-lg bg-black/[0.06] px-2.5 py-1 text-[12px] text-text-muted">📍 {r.ubicacion}</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {r.debilidades.length > 0 && (
          <MiniList icon="⚠️" title="Debilidades / oportunidades" items={r.debilidades} tone="warning" />
        )}
        {r.oportunidadesMaxirent.length > 0 && (
          <MiniList icon="✅" title="Qué le resolvemos" items={r.oportunidadesMaxirent} tone="success" />
        )}
      </div>

      {r.necesidadVehicular && (
        <p className="mt-3 text-[13px]"><span className="text-text-muted">🚚 Flota sugerida: </span>{r.necesidadVehicular}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
        <span className={`rounded-lg px-2.5 py-1 ${r.rentaOtrasMarcas.detectado ? "bg-danger/15 text-danger" : "bg-black/[0.06] text-text-muted"}`}>
          🏁 Competencia: {r.rentaOtrasMarcas.detectado ? (r.rentaOtrasMarcas.detalle ?? ((r.rentaOtrasMarcas.competidores ?? []).join(", ") || "Sí")) : "No detectada"}
        </span>
        <span className={`rounded-lg px-2.5 py-1 ${r.gobierno.tieneContratos ? "bg-info/15 text-info" : "bg-black/[0.06] text-text-muted"}`}>
          🏛️ Gobierno: {r.gobierno.tieneContratos ? (r.gobierno.detalle ?? "Con contratos") : "Sin contratos detectados"}
        </span>
      </div>

      {(r.presenciaDigital.web || r.presenciaDigital.linkedin || (r.presenciaDigital.redes ?? []).length > 0) && (
        <div className="mt-3 flex flex-col gap-1.5 text-[12px]">
          {r.presenciaDigital.web && (
            r.presenciaDigital.web.url
              ? <a href={r.presenciaDigital.web.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">🌐 {r.presenciaDigital.web.resumen ?? "Sitio web"}</a>
              : <span className="text-text-muted">🌐 {r.presenciaDigital.web.resumen}</span>
          )}
          {r.presenciaDigital.linkedin && (
            r.presenciaDigital.linkedin.url
              ? <a href={r.presenciaDigital.linkedin.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">in {r.presenciaDigital.linkedin.resumen ?? "LinkedIn"}</a>
              : <span className="text-text-muted">in {r.presenciaDigital.linkedin.resumen}</span>
          )}
          {(r.presenciaDigital.redes ?? []).map((red, i) => (
            red.url
              ? <a key={i} href={red.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">📱 {red.red}{red.resumen ? ` — ${red.resumen}` : ""}</a>
              : <span key={i} className="text-text-muted">📱 {red.red}{red.resumen ? ` — ${red.resumen}` : ""}</span>
          ))}
        </div>
      )}

      {r.argumentarioVenta.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-surface/60 p-3">
          <div className="mb-1.5 text-[12px] font-semibold text-accent">💬 Argumentario de venta</div>
          <ul className="flex flex-col gap-1">
            {r.argumentarioVenta.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px]"><span className="mt-0.5 text-accent">▸</span>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {r.fuentes.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold text-text-muted">Fuentes</div>
          <div className="flex flex-col gap-0.5">
            {r.fuentes.map((f, i) => (
              <a key={i} href={f.url} className="truncate text-[12px] text-info hover:underline">🔗 {f.titulo}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreFactorRow({ f }: { f: ScoreFactor }) {
  const pct = f.max > 0 ? Math.round((f.puntos / f.max) * 100) : 0;
  const tone = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-text">{f.factor}</span>
        <span className="font-semibold text-text-muted">{f.puntos}/{f.max}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {f.justificacion && <p className="mt-1 text-[11px] leading-snug text-text-muted">{f.justificacion}</p>}
    </div>
  );
}

function MiniList({ icon, title, items, tone }: { icon: string; title: string; items: string[]; tone: "warning" | "success" }) {
  const color = tone === "warning" ? "text-warning" : "text-success";
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1.5 text-[12px] font-semibold">{icon} {title}</div>
      <ul className="flex flex-col gap-1">
        {items.map((it, i) => (
          <li key={i} className={`flex items-start gap-2 text-[13px] ${color}`}><span className="mt-0.5">•</span><span className="text-text">{it}</span></li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-black/[0.02] p-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Block({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function MiniKpi({ label, value, accent }: { label: string; value: number; accent?: "success" | "danger" }) {
  const color = accent === "success" ? "text-success" : accent === "danger" ? "text-danger" : "text-text";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function riskColor(r?: string) {
  return r === "bajo" ? "text-success" : r === "medio" ? "text-warning" : r === "alto" ? "text-danger" : "text-text";
}
function scoreColor(s?: number) {
  if (typeof s !== "number") return "text-text";
  return s >= 75 ? "text-success" : s >= 50 ? "text-warning" : "text-danger";
}
function scoreBar(s?: number) {
  if (typeof s !== "number") return "bg-black/20";
  return s >= 75 ? "bg-success" : s >= 50 ? "bg-warning" : "bg-danger";
}
function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function formatRelative(ts: string | null) {
  if (!ts) return "";
  const normalized = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const diffMs = Date.now() - new Date(normalized).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
