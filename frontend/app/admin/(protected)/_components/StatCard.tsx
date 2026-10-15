import { toFaDigits } from "@/lib/format-number";

interface Props {
  label: string;
  value: number | null;
  /** Percent change vs. the previous period; null/undefined hides it. */
  change?: number | null;
}

export function StatCard({ label, value, change }: Props) {
  const tone = change == null || change === 0 ? "text-muted" : change > 0 ? "text-teal" : "text-red-400";
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      {value == null ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-surface2" />
      ) : (
        <div className="num mt-1 text-2xl font-bold text-ink">{toFaDigits(value.toLocaleString("en-US"))}</div>
      )}
      {change != null && (
        <div dir="ltr" className={`num mt-1 text-xs font-bold ${tone}`}>
          {change > 0 ? "▲ +" : change < 0 ? "▼ " : ""}
          {toFaDigits(change)}٪
        </div>
      )}
    </div>
  );
}
