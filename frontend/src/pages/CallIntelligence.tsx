import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone } from "lucide-react";
import { api } from "../lib/api";
import { CallAnalysisTabs } from "../components/CallAnalysisTabs";
import type { AnalyzedCallDetail } from "../types";

// ===========================================================================
//  Call Intelligence — detalle de una llamada (EN VIVO).
//  Reutiliza <CallAnalysisTabs/> (Llamada/Vendedor/Sandler/Challenger/Analiticas).
// ===========================================================================

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CallIntelligence() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyzedCallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getAnalyzedCall(id).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <button onClick={() => navigate("/call-intelligence")} className="mb-4 flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
        <ArrowLeft size={15} /> Volver al historial
      </button>

      {loading && <div className="py-20 text-center text-sm text-text-muted">Cargando analisis…</div>}
      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 p-6 text-center text-sm text-danger">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-white"><Phone size={20} /></div>
            <div>
              <h1 className="text-lg font-bold">{data.prospecto}</h1>
              <p className="text-sm text-text-muted"><span className="font-mono text-accent">{data.idLlamada}</span> · {fmt(data.fecha)}</p>
            </div>
          </div>
          <CallAnalysisTabs call={data.call} />
        </>
      )}
    </div>
  );
}
