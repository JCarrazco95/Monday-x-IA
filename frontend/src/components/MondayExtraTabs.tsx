import { useEffect, useState } from "react";
import { Mail, Phone, MapPin, Building2, MessageSquare } from "lucide-react";
import { api } from "../lib/api";
import type { MondayActivity, Region } from "../types";

// ===========================================================================
//  Contenido real (antes "cáscara") de las pestañas nativas de Monday que se
//  simulan en el panel: Principal (datos del item), Actualizaciones (updates
//  nativos) y Archivos (assets del item — ahí viven las cotizaciones que se
//  suben directo en Monday). Todo de SOLO LECTURA: no se sube nada desde aquí.
//  Compartido por Leads.tsx y monday/MondayBoardView.tsx.
// ===========================================================================

export function useMondayActivity(itemId: string | null) {
  const [data, setData] = useState<MondayActivity | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!itemId) {
      setData(null);
      return;
    }
    setLoading(true);
    api
      .getLeadMondayActivity(itemId)
      .then(setData)
      .catch(() => setData({ enabled: false, updates: [], files: [] }))
      .finally(() => setLoading(false));
  }, [itemId]);

  return { activity: data, loading };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function fileIcon(ext: string | null): string {
  if (ext === "pdf") return "📄";
  if (ext && ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "🖼️";
  if (ext && ["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (ext && ["doc", "docx"].includes(ext)) return "📝";
  return "📎";
}

function MiniField({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-black/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-semibold">{value}</p>
    </div>
  );
}

export function PrincipalPanel({
  itemName,
  email,
  telefono,
  rfc,
  razonSocial,
  region
}: {
  itemName: string;
  email?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  razonSocial?: string | null;
  region?: Region | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MiniField icon={<Building2 size={13} />} label="Contacto" value={itemName} />
      <MiniField icon={<Building2 size={13} />} label="Empresa / razón social" value={razonSocial ?? "—"} />
      <MiniField icon={<Mail size={13} />} label="Email" value={email ?? "—"} />
      <MiniField icon={<Phone size={13} />} label="Teléfono" value={telefono ?? "—"} />
      <MiniField label="RFC" value={rfc ?? "—"} />
      {region && <MiniField icon={<MapPin size={13} />} label="Región (aprox., por LADA)" value={region} />}
    </div>
  );
}

const CONNECT_HINT = (
  <>
    Conecta Monday (<code className="rounded bg-black/10 px-1 py-0.5">MONDAY_API_TOKEN</code>)
  </>
);

export function ActualizacionesPanel({ activity, loading }: { activity: MondayActivity | null; loading: boolean }) {
  if (loading) return <p className="py-10 text-center text-sm text-text-muted">Cargando actualizaciones…</p>;
  if (!activity?.enabled) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        {CONNECT_HINT} para ver aquí los comentarios/actualizaciones nativas del item.
      </p>
    );
  }
  if (activity.updates.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">Este item aún no tiene actualizaciones en Monday.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {activity.updates.map((u) => (
        <li key={u.id} className="rounded-lg border border-border p-3">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-text-muted">
            <MessageSquare size={12} />
            <span className="font-semibold text-text">{u.autor ?? "Monday"}</span>
            <span className="ml-auto">{fmtDate(u.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-[13px] text-text">{u.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function ArchivosPanel({ activity, loading }: { activity: MondayActivity | null; loading: boolean }) {
  if (loading) return <p className="py-10 text-center text-sm text-text-muted">Cargando archivos…</p>;
  if (!activity?.enabled) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        {CONNECT_HINT} para ver aquí los archivos adjuntos al item — incluidas las cotizaciones que se suban directo en Monday.
      </p>
    );
  }
  if (activity.files.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        Sin archivos adjuntos todavía. Sube la cotización (u otro archivo) directo en el item de Monday y aparecerá aquí.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {activity.files.map((f, i) => (
        <li key={i}>
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-[13px] transition-colors hover:bg-black/[0.03]"
          >
            <span className="text-lg">{fileIcon(f.extension)}</span>
            <span className="flex-1 truncate font-medium text-text">{f.nombre}</span>
            <span className="text-[11px] text-text-muted">Abrir ↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
