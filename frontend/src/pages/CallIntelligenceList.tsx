import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Phone, RefreshCw } from "lucide-react";
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

  const load = () => {
    setLoading(true);
    api
      .getAnalyzedCalls()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const calls = data?.calls ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (filterBanda && c.challengerBanda !== filterBanda) return false;
      if (!q) return true;
      return (
        c.idLlamada.toLowerCase().includes(q) ||
        c.prospecto.toLowerCase().includes(q) ||
        (c.perfilVendedor ?? "").toLowerCase().includes(q)
      );
    });
  }, [calls, search, filterBanda]);

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

      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por ID, prospecto o perfil…"
          className="h-10 flex-1 rounded-xl border border-border bg-surface px-4 text-sm placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent"
        />
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

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid grid-cols-[1fr_1.5fr_1.2fr_0.9fr_0.9fr_0.9fr_0.8fr] gap-2 border-b border-border px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          <div>ID Llamada</div>
          <div>Prospecto</div>
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
          filtered.map((c: AnalyzedCallListItem) => (
            <button
              key={c.itemId}
              onClick={() => navigate(`/call-intelligence/${c.itemId}`)}
              className="grid w-full grid-cols-[1fr_1.5fr_1.2fr_0.9fr_0.9fr_0.9fr_0.8fr] items-center gap-2 border-b border-border px-5 py-3.5 text-left text-sm transition-colors last:border-0 hover:bg-black/[0.02]"
            >
              <div className="font-mono text-xs text-accent">{c.idLlamada}</div>
              <div className="truncate font-medium">{c.prospecto}</div>
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
            </button>
          ))}
      </div>

      {!loading && !error && filtered.length > 0 && (
        <p className="mt-4 text-center text-xs text-text-muted">
          Haz clic en cualquier llamada para ver el analisis Sandler + Challenger completo.
        </p>
      )}
    </div>
  );
}
