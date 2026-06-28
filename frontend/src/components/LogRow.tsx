import type { LogEntry } from "../types";
import { LogTypeBadge } from "./Badge";

function formatTimestamp(ts: string) {
  // El backend guarda en SQLite como 'YYYY-MM-DD HH:MM:SS' (UTC) o ISO
  const normalized = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ActivityFeedItem({ log }: { log: LogEntry }) {
  return (
    <div className="flex gap-3 border-b border-border py-3 last:border-0">
      <div className="mt-1">
        <LogTypeBadge type={log.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{log.title}</span>
          <span className="shrink-0 text-xs text-text-muted">{formatTimestamp(log.timestamp)}</span>
        </div>
        {log.detail && <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{log.detail}</p>}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
          <span className="rounded bg-bg px-1.5 py-0.5">{log.agent_name ?? log.agent_id}</span>
          {log.reference && <span className="truncate">{log.reference}</span>}
        </div>
      </div>
    </div>
  );
}

export function LogTableRow({ log }: { log: LogEntry }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-black/[0.02]">
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-text-muted">
        {formatTimestamp(log.timestamp)}
      </td>
      <td className="px-3 py-2.5 text-sm">{log.agent_name ?? log.agent_id}</td>
      <td className="px-3 py-2.5">
        <LogTypeBadge type={log.type} />
      </td>
      <td className="px-3 py-2.5 text-sm font-medium">{log.title}</td>
      <td className="max-w-xs px-3 py-2.5 text-xs text-text-muted">
        <span className="line-clamp-2">{log.detail}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-text-muted">{log.reference}</td>
    </tr>
  );
}
