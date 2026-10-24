import { MonoLabel } from "@/components/list-detail/ui";
import { TasteShare } from "@/lib/types";
import { countryNameFa } from "@/lib/country";
import { toFaDigits } from "@/lib/format-number";

/** "1980" -> "۸۰" (the usual Persian "دههٔ ۸۰"), but 2000 onward in full:
 *  "۰۰" or "۱۰" alone wouldn't read as a decade. */
const decadeLabel = (key: string) => toFaDigits(Number(key) >= 2000 ? key : key.slice(2));

/** Decades (chronological columns) and countries (bars) the titles a user
 *  likes come from, as shares of their liked-title weight. */
export default function TasteErasCard({ decades, countries }: { decades: TasteShare[]; countries: TasteShare[] }) {
  if (decades.length === 0 && countries.length === 0) return null;

  const chronological = [...decades].sort((a, b) => Number(a.key) - Number(b.key));
  const maxShare = Math.max(...decades.map((d) => d.share), 1);
  const topDecade = decades[0];
  const namedCountries = countries
    .map((c) => ({ ...c, name: countryNameFa(c.key) }))
    .filter((c): c is TasteShare & { name: string } => c.name !== null)
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-border-soft bg-surface/60 p-6">
      <MonoLabel size="text-[10px]">ERAS &amp; ORIGINS</MonoLabel>
      <h3 className="mt-1 text-base font-bold text-ink">زمان و مکان</h3>

      {chronological.length > 0 && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-bold text-muted">دهه‌ها</h4>
            {topDecade && (
              <span className="text-[11px] text-dim">
                محبوب‌ترین: دههٔ <span className="num text-gold">{decadeLabel(topDecade.key)}</span>
              </span>
            )}
          </div>
          {/* Columns read oldest -> newest left to right, like a timeline. */}
          <div className="mt-3 flex h-32 items-end gap-2" dir="ltr">
            {chronological.map((d) => (
              <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="num text-[10px] text-dim">{toFaDigits(Math.round(d.share))}٪</span>
                <div
                  className={`w-full max-w-[44px] rounded-t-md ${d.key === topDecade?.key ? "bg-gradient-to-t from-gold/50 to-gold" : "bg-teal/40"}`}
                  style={{ height: `${Math.max(6, (d.share / maxShare) * 100)}%` }}
                />
                <span className="num text-[10px] text-muted">{decadeLabel(d.key)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {namedCountries.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-bold text-muted">کشورها</h4>
          <div className="mt-3 flex flex-col gap-2.5">
            {namedCountries.map((c) => (
              <div key={c.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3">
                <span className="truncate text-xs text-ink-dim">{c.name}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                  <div className="h-full rounded-full bg-teal/70" style={{ width: `${c.share}%` }} />
                </div>
                <span className="num text-left text-[11px] text-muted">{toFaDigits(Math.round(c.share))}٪</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
