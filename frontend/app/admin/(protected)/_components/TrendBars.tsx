"use client";
import { useState } from "react";
import { toFaDigits } from "@/lib/format-number";

const fa = (n: number) => toFaDigits(n.toLocaleString("en-US"));

/** "YYYY-MM-DD" (a Tehran calendar day) -> "۲۹ مهر". */
export const tehranDayLabel = (date: string) =>
  new Date(`${date}T12:00:00+03:30`).toLocaleDateString("fa-IR", { month: "long", day: "numeric" });

interface Props<D extends { date: string }> {
  title: string;
  /** Word after the number in the tooltip ("رأی", "ثبت‌نام"). */
  unit: string;
  days: D[]; // oldest first, today last
  pick: (d: D) => number;
  /** Caption beside the title, e.g. "مجموع ۳۰ روز"; the sum is appended. Omit to hide it. */
  totalLabel?: string;
  height?: string;
}

/** One metric per day as columns: a single series, so each chart keeps its own scale. */
export function TrendBars<D extends { date: string }>({ title, unit, days, pick, totalLabel, height = "h-28" }: Props<D>) {
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const n = values.length;
  const edge = Math.max(2, Math.round(n / 7));
  const tipShift = hover == null ? "" : hover < edge ? "translate-x-0" : hover > n - 1 - edge ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <figure className="rounded-xl border border-border bg-surface p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-ink">{title}</span>
        {totalLabel && (
          <span className="text-xs text-muted">
            {totalLabel}: <b className="num text-ink">{fa(total)}</b>
          </span>
        )}
      </figcaption>
      <div dir="ltr" className="relative mt-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border-soft" />
        <span className="num pointer-events-none absolute -top-2 left-0 bg-surface pe-1 text-[10px] leading-none text-dim">{fa(max)}</span>
        <div
          className={`flex ${height} items-end gap-[2px] border-b border-border`}
          onMouseOver={(e) => {
            const i = (e.target as HTMLElement).closest<HTMLElement>("[data-i]")?.dataset.i;
            if (i != null) setHover(Number(i));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {values.map((v, i) => (
            <div key={days[i].date} data-i={i} className="flex h-full flex-1 items-end justify-center">
              <div
                className={`w-full max-w-[24px] rounded-t-[4px] transition-colors ${hover === i ? "bg-teal" : "bg-teal/60"}`}
                style={{ height: v ? `${Math.max(2, (v / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
        {hover != null && (
          <div
            dir="rtl"
            className={`pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-md border border-border bg-surface2 px-2.5 py-1.5 text-xs shadow-lg ${tipShift}`}
            style={{ left: `${((hover + 0.5) / n) * 100}%` }}
          >
            <div className="text-muted">{hover === n - 1 ? "امروز" : tehranDayLabel(days[hover].date)}</div>
            <div className="num font-bold text-ink">
              {fa(values[hover])} {unit}
            </div>
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[11px] text-dim">
          <span>{tehranDayLabel(days[0].date)}</span>
          <span>امروز</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.date}>
              <th scope="row">{tehranDayLabel(d.date)}</th>
              <td>{fa(values[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
