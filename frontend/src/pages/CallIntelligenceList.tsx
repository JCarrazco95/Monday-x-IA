import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Phone, RefreshCw, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import type { AnalyzedCallListItem, AnalyzedCallsResponse, Banda } from "../types";

// ===========================================================================
//  Call Intelligence — Historial de llamadas analizadas EN VIVO.
//  Lee /api/calls/analyzed (Sandler + Challenger). Cada llamada simulada/real
//  aparece aqui automaticamente. Al hacer clic navega al analisis completo.
// ===========================================================================

const BAND_TEXT: Record<Banda, string> = { rojo: "text-danger", amarillo: "text-warning", verde: "text-success" };
const BAND_CHIP: Record<Banda, string> = {
  rojo: "bg-danger/15 text-danger border border-danger/20",
  amarillo: "bg-warning/15 text-warning border border-warning/20",
  verde: "bg-success/15 text-success border border-success/20"
};
const BAND_LABEL: Record<Banda, string> = { rojo: "Deficiente", amarillo: "Aceptable", verde: "Bueno" };
const BAND_BAR: Record<Banda, string> = { rojo: "bg-danger", amarillo: "bg-warning", verde: "bg-success" };
const SENT_CHIP: Record<string, string> = {
  positivo: "bg-success/10 text-success",
  neutro: "bg-border text-text-muted",
  negativo: "bg-danger/10 text-danger"
};
const SENT_LABEL: Record<string, string> = { positivo: "Positivo", neutro: "Neutro", negativo: "Negativo" };

// Solo las llamadas ingeridas por ID de Aircall (itemId = "aircall-<id>")
// tienen grabación reproducible; las de transcripción pegada ("call-<hash>")
// o por URL ("url-<hash>") no. La URL de grabación de Aircall va firmada y
// expira (~1h), así que no se puede precalcular: se pide fresca al backend
// (GET /calls/:itemId/audio) en el momento del clic.
function isAircallCall(itemId: string): boolean {
  return /^aircall-\d+$/.test(itemId);
}

async function openRecording(itemId: string) {
  try {
    const { url } = await api.getCallAudioUrl(itemId);
    window.open(url, "_blank", "noreferrer");
  } catch {
    window.alert("No se pudo obtener la grabación de esta llamada.");
  }
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color ?? "text-text"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

function ScoreBar({ score, banda }: { score: number | null; banda: Banda | null }) {
  if (score === null || banda === null) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-7 font-semibold ${BAND_TEXT[banda]}`}>{score}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10">
        <div className={`h-full rounded-full ${BAND_BAR[banda]}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function CallIntelligenceList() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyzedCallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterBanda, setFilterBanda] = useState<Banda | "">("");
  const [filterVendedor, setFilterVendedor] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [soloMejores, setSoloMejores] = useState(false); // C.5: biblioteca de mejores llamadas
  const [filterTema, setFilterTema] = useState(""); // chip de tema de conversación

  // Traer llamada: por ID de Aircall, por URL de la grabación, o pegar transcripción
  const [callId, setCallId] = useState("");
  const [recUrl, setRecUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [prospecto, setProspecto] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Actividad reciente de Aircall (contestadas y no) — directo de la API, sin
  // depender del tablero de llamadas en Monday (desactualizado desde marzo).
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof api.getCallActivity>> | null>(null);
  const [activityFilter, setActivityFilter] = useState<"todas" | "contestadas" | "no_contestadas">("todas");
  const [syncingAircall, setSyncingAircall] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const loadActivity = () => { api.getCallActivity().then(setActivity).catch(() => setActivity(null)); };
  useEffect(loadActivity, []);

  async function handleSyncAircall() {
    setSyncingAircall(true);
    setSyncMsg(null);
    try {
      await api.syncAircall();
      for (;;) {
        const s = await api.getAircallSyncStatus();
        if (!s.running) {
          if (s.error) setSyncMsg(`Error: ${s.error}`);
          else if (s.result) {
            setSyncMsg(
              s.result.analizadas > 0
                ? `✓ ${s.result.analizadas} llamada(s) nueva(s) analizada(s) (${s.result.noContestadas} no contestadas, ${s.result.yaAnalizadas} ya estaban).`
                : `Sin llamadas nuevas por analizar de ${s.result.leidas} encontradas (${s.result.noContestadas} no contestadas, ${s.result.yaAnalizadas} ya estaban).`
            );
          }
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      load();
      loadActivity();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Error al sincronizar.");
    } finally {
      setSyncingAircall(false);
    }
  }

  const activityFiltered = useMemo(() => {
    const rows = activity?.calls ?? [];
    if (activityFilter === "contestadas") return rows.filter((r) => r.contestada);
    if (activityFilter === "no_contestadas") return rows.filter((r) => !r.contestada);
    return rows;
  }, [activity, activityFilter]);

  const load = () => {
    setLoading(true);
    api
      .getAnalyzedCalls()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function runIngest(fn: () => Promise<{ analizada: boolean; itemId?: string; motivo?: string }>) {
    setIngesting(true);
    setIngestMsg(null);
    try {
      const res = await fn();
      if (res.analizada && res.itemId) {
        navigate(`/call-intelligence/${res.itemId}`);
      } else {
        setIngestMsg({ ok: false, text: res.motivo ?? "No se pudo analizar la llamada." });
      }
    } catch (e) {
      setIngestMsg({ ok: false, text: e instanceof Error ? e.message : "Error al traer la llamada." });
    } finally {
      setIngesting(false);
    }
  }
  const onIngestId = () => callId.trim() && runIngest(() => api.ingestAircallCall(callId.trim()));
  const onIngestUrl = () => recUrl.trim() && runIngest(() => api.ingestCallFromUrl(recUrl.trim()));
  const onIngestTranscript = () =>
    transcript.trim() && runIngest(() => api.analyzeTranscript(transcript.trim(), { prospecto: prospecto.trim() || undefined }));

  const calls = data?.calls ?? [];

  // Vendedores únicos presentes en el historial (para el filtro).
  const vendedores = useMemo(
    () => [...new Set(calls.map((c) => c.vendedor).filter((v): v is string => Boolean(v)))].sort(),
    [calls]
  );

  // Temas más frecuentes del historial (chips de filtro; normaliza por minúsculas).
  const temasTop = useMemo(() => {
    const map = new Map<string, { texto: string; count: number }>();
    for (const c of calls) {
      for (const t of c.temas ?? []) {
        const key = t.toLowerCase().replace(/\s+/g, " ");
        const cur = map.get(key);
        if (cur) cur.count += 1;
        else map.set(key, { texto: t, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [calls]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (filterBanda && (c.globalBanda ?? c.challengerBanda) !== filterBanda) return false;
      if (filterVendedor && c.vendedor !== filterVendedor) return false;
      if (filterTema && !(c.temas ?? []).some((t) => t.toLowerCase().replace(/\s+/g, " ") === filterTema)) return false;
      // Fechas: la fecha viene en ISO UTC; comparar por prefijo YYYY-MM-DD.
      if (fechaDesde && (c.fecha ?? "") < fechaDesde) return false;
      if (fechaHasta && (c.fecha ?? "") > fechaHasta + "T23:59:59Z") return false;
      // "Mejores llamadas" (C.5): score global >= 75 (material de entrenamiento).
      if (soloMejores && (c.globalScore ?? c.sandlerScore) < 75) return false;
      if (!q) return true;
      return (
        c.idLlamada.toLowerCase().includes(q) ||
        c.prospecto.toLowerCase().includes(q) ||
        (c.vendedor ?? "").toLowerCase().includes(q) ||
        (c.perfilVendedor ?? "").toLowerCase().includes(q)
      );
    });
  }, [calls, search, filterBanda, filterVendedor, filterTema, fechaDesde, fechaHasta, soloMejores]);

  const s = data?.stats;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white">
          <Compass size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Call Intelligence</h1>
          <p className="text-sm text-text-muted">
            Historial de llamadas · Sandler + Challenger · {s?.total ?? 0} registros
          </p>
        </div>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text"
        >
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Traer una llamada y analizarla: por ID de Aircall o por URL de la grabación */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
          <Phone size={16} className="text-accent" /> Analizar una llamada
        </div>

        {/* Opción destacada: pegar transcripción ya existente (no re-transcribe) */}
        <label className="text-xs font-medium text-text-muted">Pegar transcripción (ya hecha por Aircall/Twilio — no se re-transcribe)</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={4}
          placeholder={"Pega aquí la transcripción de la llamada, p. ej.:\nJuan Martinez: Hola, buenos días…\nRaul Alcaraz: Busco una mini truck o minivan…"}
          className="mt-1 w-full rounded-xl border border-border bg-bg px-4 py-2 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={prospecto}
            onChange={(e) => setProspecto(e.target.value)}
            placeholder="Prospecto / cliente (opcional, ej. Raul Alcaraz)"
            className="h-10 flex-1 rounded-xl border border-border bg-bg px-4 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={onIngestTranscript}
            disabled={ingesting || transcript.trim().length < 40}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            <RefreshCw size={15} className={ingesting ? "animate-spin" : ""} />
            Analizar transcripción
          </button>
        </div>

        <div className="my-4 border-t border-border" />

        {/* Opción 1: por ID de Aircall */}
        <label className="text-xs font-medium text-text-muted">Por ID de Aircall (trae su transcripción automáticamente)</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onIngestId()}
            placeholder="ID numérico de Aircall (ej. 1234567890)"
            className="h-10 flex-1 rounded-xl border border-border bg-bg px-4 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={onIngestId}
            disabled={ingesting || !callId.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            <RefreshCw size={15} className={ingesting ? "animate-spin" : ""} />
            Traer y analizar
          </button>
        </div>

        {/* Opción 2: por URL de la grabación (cualquier proveedor) */}
        <label className="mt-3 block text-xs font-medium text-text-muted">O por URL de la grabación (Twilio, Aircall, S3…)</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input
            value={recUrl}
            onChange={(e) => setRecUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onIngestUrl()}
            placeholder="https://…/grabacion.mp3"
            className="h-10 flex-1 rounded-xl border border-border bg-bg px-4 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={onIngestUrl}
            disabled={ingesting || !recUrl.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-accent px-5 text-sm font-medium text-accent disabled:opacity-50"
          >
            <RefreshCw size={15} className={ingesting ? "animate-spin" : ""} />
            Transcribir y analizar
          </button>
        </div>

        <p className="mt-2 text-xs text-text-muted">
          {ingesting
            ? "Trayendo, transcribiendo y analizando… puede tardar unos segundos."
            : "Por URL: el enlace debe apuntar al audio (mp3/wav) y ser accesible. Se transcribe con Deepgram y se corre el análisis (Sandler + Challenger)."}
        </p>
        {ingestMsg && (
          <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${ingestMsg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
            {ingestMsg.text}
          </div>
        )}
      </div>

      {/* Actividad reciente de Aircall (contestadas y no) — directo de la API,
          no del tablero de Monday (desactualizado desde marzo). */}
      {activity?.enabled && (
        <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Phone size={16} className="text-accent" /> Actividad de llamadas (últimas 48h)
            </div>
            <span className="text-xs text-text-muted">{activity.total} encontradas</span>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as typeof activityFilter)}
                className="h-8 rounded-lg border border-border bg-bg px-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="todas">Todas</option>
                <option value="contestadas">Contestadas</option>
                <option value="no_contestadas">No contestadas</option>
              </select>
              <button
                onClick={handleSyncAircall}
                disabled={syncingAircall}
                title="Trae y analiza las llamadas nuevas directo de Aircall (sin esperar al cron)"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-60"
              >
                <RefreshCw size={12} className={syncingAircall ? "animate-spin" : ""} />
                {syncingAircall ? "Sincronizando…" : "Sincronizar ahora"}
              </button>
            </div>
          </div>

          {syncMsg && <div className="mb-2 rounded-lg bg-accent/[0.06] px-3 py-1.5 text-xs text-text">{syncMsg}</div>}

          {activityFiltered.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-muted">Sin llamadas en este filtro.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface text-text-muted">
                  <tr className="border-b border-border">
                    <th className="py-1.5 text-left font-medium">Hora</th>
                    <th className="py-1.5 text-left font-medium">Teléfono</th>
                    <th className="py-1.5 text-left font-medium">Agente</th>
                    <th className="py-1.5 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {activityFiltered.map((r) => (
                    <tr
                      key={r.itemId}
                      onClick={() => r.analizada && navigate(`/call-intelligence/${r.itemId}`)}
                      className={`border-b border-border/50 last:border-0 ${r.analizada ? "cursor-pointer hover:bg-black/[0.02]" : ""}`}
                    >
                      <td className="py-1.5 text-text-muted">{fmt(r.fecha)}</td>
                      <td className="py-1.5">{r.telefono ?? "—"}</td>
                      <td className="py-1.5 text-text-muted">{r.agente ?? "—"}</td>
                      <td className="py-1.5">
                        {!r.contestada ? (
                          <span className="rounded-full bg-border px-2 py-0.5 text-[10px] font-medium text-text-muted">No contestada</span>
                        ) : r.analizada ? (
                          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">Analizada</span>
                        ) : (
                          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Llamadas analizadas" value={s?.total ?? 0} sub="ultimos analisis" />
        <StatCard label="Sandler promedio" value={`${s?.sandlerPromedio ?? 0}/100`} color="text-warning" sub="mecanica de venta" />
        <StatCard label="Challenger promedio" value={`${s?.challengerPromedio ?? 0}/100`} color="text-accent" sub="reto comercial" />
        <StatCard label="Indice global" value={`${s?.globalPromedio ?? 0}/100`} color="text-success" sub="modelos integrados" />
        <StatCard
          label="Verdes / rojas"
          value={
            <>
              <span className="text-success">{s?.verdes ?? 0}</span>
              <span className="text-text-muted"> / </span>
              <span className="text-danger">{s?.rojas ?? 0}</span>
            </>
          }
          sub="banda Challenger"
        />
      </div>

      <div className="mb-3 flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ID, prospecto, vendedor o perfil…"
            className="h-10 flex-1 rounded-xl border border-border bg-surface px-4 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <select
            value={filterVendedor}
            onChange={(e) => setFilterVendedor(e.target.value)}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Todos los vendedores</option>
            {vendedores.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select
            value={filterBanda}
            onChange={(e) => setFilterBanda(e.target.value as Banda | "")}
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Todas las bandas</option>
            <option value="verde">Verde (≥75)</option>
            <option value="amarillo">Amarillo (50-74)</option>
            <option value="rojo">Rojo (&lt;50)</option>
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <button
            onClick={() => setSoloMejores((v) => !v)}
            className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
              soloMejores
                ? "bg-success/15 text-success ring-1 ring-success/30"
                : "border border-border bg-surface text-text-muted hover:text-text"
            }`}
            title="Biblioteca de mejores llamadas (score global ≥ 75): material real para entrenar vendedores"
          >
            ⭐ Mejores llamadas
          </button>
          {(filterVendedor || fechaDesde || fechaHasta || filterBanda || soloMejores || search || filterTema) && (
            <button
              onClick={() => { setSearch(""); setFilterBanda(""); setFilterVendedor(""); setFechaDesde(""); setFechaHasta(""); setSoloMejores(false); setFilterTema(""); }}
              className="h-9 rounded-lg px-3 text-sm text-text-muted underline-offset-2 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
          <span className="text-xs text-text-muted sm:ml-auto">{filtered.length} de {calls.length} llamadas</span>
        </div>
        {temasTop.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-text-muted">Temas:</span>
            {temasTop.map((t) => {
              const key = t.texto.toLowerCase().replace(/\s+/g, " ");
              const activo = filterTema === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilterTema(activo ? "" : key)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activo
                      ? "bg-accent text-white"
                      : "border border-border bg-surface text-text-muted hover:text-text"
                  }`}
                  title={`Llamadas que tocaron "${t.texto}"`}
                >
                  {t.texto} <span className={activo ? "text-white/80" : "text-text-muted/70"}>×{t.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1.4fr_1fr_1.1fr_0.9fr_0.9fr_0.9fr_0.8fr] gap-2 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <div>ID Llamada</div>
          <div>Prospecto</div>
          <div>Vendedor</div>
          <div>Fecha</div>
          <div>Sandler</div>
          <div>Challenger</div>
          <div>Global</div>
          <div>Sentim.</div>
        </div>

        {loading && <div className="px-5 py-10 text-center text-sm text-text-muted">Cargando llamadas…</div>}
        {error && <div className="px-5 py-10 text-center text-sm text-danger">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Phone size={20} />
            </div>
            <p className="text-sm font-medium">Aun no hay llamadas analizadas</p>
            <p className="mt-1 text-xs text-text-muted">
              Ve al <span className="font-medium text-accent">Dashboard</span> y pulsa{" "}
              <span className="font-medium">"Simular llamada"</span>, o procesa una llamada real desde Monday.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          filtered.map((c: AnalyzedCallListItem) => {
            return (
              <div
                key={c.itemId}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/call-intelligence/${c.itemId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/call-intelligence/${c.itemId}`);
                  }
                }}
                className="grid w-full cursor-pointer grid-cols-[1fr_1.4fr_1fr_1.1fr_0.9fr_0.9fr_0.9fr_0.8fr] items-center gap-2 border-b border-border px-5 py-3.5 text-left text-sm transition-colors last:border-0 hover:bg-black/[0.02]"
              >
                {isAircallCall(c.itemId) ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void openRecording(c.itemId); }}
                    title="Escuchar la grabación (pestaña nueva)"
                    className="inline-flex w-fit items-center gap-1 font-mono text-xs text-accent hover:underline"
                  >
                    {c.idLlamada} <ExternalLink size={11} className="shrink-0" />
                  </button>
                ) : (
                  <div className="font-mono text-xs text-accent">{c.idLlamada}</div>
                )}
                <div className="truncate font-medium">{c.prospecto}</div>
              <div className="truncate text-xs text-text-muted">{c.vendedor ?? "—"}</div>
              <div className="text-xs text-text-muted">{fmt(c.fecha)}</div>
              <ScoreBar score={c.sandlerScore} banda={c.sandlerBanda} />
              <ScoreBar score={c.challengerScore} banda={c.challengerBanda} />
              <div className="flex items-center gap-2">
                <ScoreBar score={c.globalScore} banda={c.globalBanda} />
                {c.globalBanda && (
                  <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold lg:inline ${BAND_CHIP[c.globalBanda]}`}>
                    {BAND_LABEL[c.globalBanda]}
                  </span>
                )}
              </div>
              <div>
                {c.sentimiento ? (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${SENT_CHIP[c.sentimiento] ?? "bg-border text-text-muted"}`}>
                    {SENT_LABEL[c.sentimiento] ?? c.sentimiento}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </div>
              </div>
            );
          })}
      </div>

      {!loading && !error && filtered.length > 0 && (
        <p className="mt-4 text-center text-xs text-text-muted">
          Haz clic en cualquier llamada para ver el analisis Sandler + Challenger completo.
        </p>
      )}
    </div>
  );
}
