import type { AdminAuditLogRow } from "@/lib/admin-audit";

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Field-by-field before (red, struck through) / after (green) view of one audit row. */
export function AuditDiff({ row }: { row: AdminAuditLogRow }) {
  const keys = Array.from(new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]));
  if (keys.length === 0) return <p className="text-xs text-muted">جزئیاتی ثبت نشده است.</p>;
  return (
    <div dir="ltr" className="space-y-1.5 text-start font-mono text-xs">
      {keys.map((k) => (
        <div key={k} className="flex flex-wrap items-baseline gap-2">
          <span className="text-muted">{k}</span>
          {row.before && k in row.before && (
            <span className="break-all rounded bg-red-500/15 px-1.5 py-0.5 text-red-300 line-through decoration-red-400/50">{show(row.before[k])}</span>
          )}
          {row.after && k in row.after && <span className="break-all rounded bg-teal/15 px-1.5 py-0.5 text-teal">{show(row.after[k])}</span>}
        </div>
      ))}
    </div>
  );
}
