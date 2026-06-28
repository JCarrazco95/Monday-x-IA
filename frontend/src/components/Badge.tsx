import type { AgentStatus, LogType } from "../types";

const statusStyles: Record<AgentStatus, string> = {
  active: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  error: "bg-danger/15 text-danger border-danger/30"
};

const statusLabels: Record<AgentStatus, string> = {
  active: "Activo",
  paused: "Pausado",
  error: "Error"
};

export function StatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}

const logTypeStyles: Record<LogType, string> = {
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  error: "bg-danger/15 text-danger border-danger/30"
};

const logTypeLabels: Record<LogType, string> = {
  info: "Info",
  success: "Éxito",
  warning: "Advertencia",
  error: "Error"
};

export function LogTypeBadge({ type }: { type: LogType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${logTypeStyles[type]}`}
    >
      {logTypeLabels[type]}
    </span>
  );
}
