import { useEffect, useMemo, useState } from "react";
import { Radar, Search, Loader2, Phone, Globe, MapPin, Download, CheckCircle2, AlertTriangle, Info, Plus } from "lucide-react";
import { api } from "../lib/api";
import type { ScraperSource, ScoredProspect, ScraperImportResult } from "../types";

// ===========================================================================
//  Prospección de leads (scraper) — busca empresas por sector + ciudad desde
//  una fuente conectable, las muestra en tabla con checkboxes y permite
//  importarlas. Cada importación crea el lead en Monday y dispara el análisis
//  con IA (mismo flujo que la landing). PREVIEW no escribe; Importar sí.
// ===========================================================================

export function LeadScraper() {
  const [sources, setSources] = useState<ScraperSource[]>([]);
  const [source, setSource] = useState("");
  const [sector, setSector] = useState("");
  const [ciudad, setCiudad] = useState("Monterrey");
  const [limite, setLimite] = useState(20);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [rows, setRows] = useState<ScoredProspect[]>([]);
  const [page, setPage] = useState(0);
  const [noMore, setNoMore] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importResult, setImportResult] = useState<ScraperImportResult | null>(null);

  useEffect(() => {
    api.getScraperSources()
      .then((r) => {
        setSources(r.sources);
        const first = r.sources.find((s) => s.enabled) ?? r.sources[0];
        if (first) setSource(first.id);
      })
      .catch(() => setSources([]));
  }, []);

  const activeSource = useMemo(() => sources.find((s) => s.id === source), [sources, source]);

  async function onSearch() {
    if (!sector.trim() || !source) return;
    setLoading(true);
    setError(null);
    setImportResult(null);
    setNoMore(false);
    setPage(0);
    try {
      const res = await api.searchProspects({ source, sector: sector.trim(), ciudad: ciudad.trim(), limite, page: 0 });
      setRows(res.prospects);
      setDemo(res.demo);
      // Preselecciona todos (ya vienen solo los nuevos).
      setSelected(new Set(res.prospects.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al buscar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Trae MÁS prospectos (página siguiente) y los acumula sin repetir.
  async function onLoadMore() {
    if (!sector.trim() || !source) return;
    setLoadingMore(true);
    setError(null);
    const next = page + 1;
    try {
      const res = await api.searchProspects({ source, sector: sector.trim(), ciudad: ciudad.trim(), limite, page: next });
      setPage(next);
      const have = new Set(rows.map((r) => r.externalId || r.nombre.toLowerCase()));
      const fresh = res.prospects.filter((p) => !have.has(p.externalId || p.nombre.toLowerCase()));
      if (fresh.length === 0) {
        setNoMore(true);
      } else {
        setRows((prev) => {
          const merged = [...prev, ...fresh];
          // Preselecciona los recién añadidos.
          setSelected((sel) => {
            const s = new Set(sel);
            for (let i = prev.length; i < merged.length; i++) s.add(i);
            return s;
          });
          return merged;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar más.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function onImport() {
    const chosen = rows.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await api.importProspects(chosen);
      setImportResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setImporting(false);
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((_, i) => i)));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-1 flex items-center gap-2">
        <Radar className="text-accent" size={22} />
        <h1 className="text-2xl font-semibold text-text">Prospección de leads</h1>
      </div>
      <p className="mb-5 text-sm text-text-muted">
        Busca empresas por sector y ciudad desde fuentes oficiales, y dales de alta como leads.
        Cada alta se enriquece y califica automáticamente con la IA.
      </p>

      {/* Formulario de búsqueda */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-text-muted">
            Fuente
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.enabled ? "" : " (demo)"}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-text-muted lg:col-span-1">
            Sector / qué buscar
            <input
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="constructoras, transportistas…"
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-medium text-text-muted">
            Ciudad
            <input
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="text-xs font-medium text-text-muted">
            Máx. resultados
            <input
              type="number"
              min={1}
              max={40}
              value={limite}
              onChange={(e) => setLimite(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text"
            />
          </label>
        </div>

        {activeSource?.aviso && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-info/5 px-3 py-2 text-xs text-text-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-info" />
            <span>{activeSource.aviso}</span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={onSearch}
            disabled={loading || !sector.trim() || !source}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Buscar
          </button>
          {!activeSource?.enabled && activeSource && (
            <span className="text-xs text-warning">Esta fuente no tiene credencial: resultados de demostración.</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Aviso inequívoco cuando el resultado es de demostración */}
      {demo && rows.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          <span className="font-semibold text-warning">⚠️ Resultados de DEMOSTRACIÓN — no son empresas reales.</span>{" "}
          La fuente «{activeSource?.label ?? source}» no tiene credencial/API configurada.{" "}
          {activeSource?.aviso ?? "Configura su credencial en el backend para obtener prospectos reales."}{" "}
          Las fuentes marcadas con «(demo)» en el selector están en este estado; usa una sin marca (p. ej. Lusha) para datos reales.
        </div>
      )}

      {/* Resultado de importación */}
      {importResult && (
        <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 size={18} /> Importación completada
          </div>
          <div className="mt-1 text-sm text-text">
            {importResult.importados} lead(s) creado(s){importResult.omitidos > 0 && `, ${importResult.omitidos} omitido(s) por duplicado`}
            {importResult.errores.length > 0 && `, ${importResult.errores.length} con error`}. Aparecen en{" "}
            <a href="/leads" className="font-medium text-accent underline">Análisis IA</a>.
          </div>
        </div>
      )}

      {/* Tabla de prospectos */}
      {rows.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="text-sm text-text-muted">
              <span className="font-semibold text-success">{rows.length}</span> prospecto(s) nuevo(s)
              {demo && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">DEMO</span>}
            </div>
            <button
              onClick={onImport}
              disabled={importing || selected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Importar {selected.size} seleccionado(s)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2">
                    <input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} />
                  </th>
                  <th className="px-4 py-2">Empresa</th>
                  <th className="px-4 py-2">Contacto</th>
                  <th className="px-4 py-2">Ubicación</th>
                  <th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={i} className={`border-b border-border/60 ${p.duplicado ? "opacity-60" : ""}`}>
                    <td className="px-4 py-2 align-top">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-text">{p.nombre}</div>
                      {p.categoria && <div className="text-xs text-text-muted">{p.categoria}</div>}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-text-muted">
                      {p.telefono && <div className="flex items-center gap-1"><Phone size={12} />{p.telefono}</div>}
                      {p.sitioWeb && (
                        <div className="flex items-center gap-1">
                          <Globe size={12} />
                          <a href={p.sitioWeb} target="_blank" rel="noreferrer" className="text-accent underline">sitio</a>
                        </div>
                      )}
                      {!p.telefono && !p.sitioWeb && <span>—</span>}
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-text-muted">
                      {p.direccion ? <div className="flex items-start gap-1"><MapPin size={12} className="mt-0.5 shrink-0" />{p.direccion}</div> : "—"}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {p.duplicado ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                          <AlertTriangle size={11} /> Duplicado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                          <CheckCircle2 size={11} /> Nuevo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cargar más prospectos (página siguiente, sin repetir) */}
          <div className="flex items-center justify-center border-t border-border px-4 py-3">
            {noMore ? (
              <span className="text-xs text-text-muted">No hay más prospectos nuevos para esta búsqueda.</span>
            ) : (
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:text-text disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Más resultados
              </button>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 && !loading && (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
          Busca un sector (ej. <span className="font-medium text-text">"constructoras"</span>) para encontrar prospectos.
        </div>
      )}
    </div>
  );
}
