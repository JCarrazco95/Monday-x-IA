const accentColors = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info"
} as const;

export function KpiCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string | number;
  accent?: keyof typeof accentColors;
}) {
  const accentColor = accent ? accentColors[accent] : "text-text";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accentColor}`}>{value}</div>
    </div>
  );
}
