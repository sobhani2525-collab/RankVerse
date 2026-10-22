import Link from "next/link";
import { toFaDigits } from "@/lib/format-number";

interface Props {
  label: string;
  value: number | null;
  /** Percent change vs. the previous period; null/undefined hides it. */
  change?: number | null;
  /** A secondary line under the value (e.g. the all-time total). */
  hint?: string;
  /** Makes the whole card a link to the page that manages it. */
  href?: string;
}

export function StatCard({ label, value, change, hint, href }: Props) {
  const tone = change == null || change === 0 ? "text-muted" : change > 0 ? "text-teal" : "text-red-400";
  const body = (
    <>
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
      {hint && value != null && <div className="mt-1 text-xs text-dim">{hint}</div>}
    </>
  );
  const box = "block rounded-xl border border-border bg-surface p-4";
  return href ? (
    <Link href={href} className={`${box} transition hover:border-gold/40`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
