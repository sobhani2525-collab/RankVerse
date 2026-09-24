import type { ListDna } from "@/lib/types";
import { toFaDigits } from "@/lib/format-number";
import { genreLabel } from "@/lib/genre-labels";
import { entityHref, GENRE_CHIP, PEOPLE_CHIP } from "@/lib/list-constellation";
import { Chip, MonoLabel } from "./ui";
import FollowerStat from "./FollowerStat";

// Teal shades for the segmented genre bar, most common genre first.
const GENRE_SHADES = ["bg-teal", "bg-teal/75", "bg-teal/55", "bg-teal/40", "bg-teal/30", "bg-teal/20"];
const MAX_GENRES = 6;

// Persian stays out of MonoLabel: its letter-spacing breaks Persian
// letter joining.
function BlockLabel({ en, fa }: { en: string; fa: string }) {
  return (
    <div className="flex items-center gap-2">
      <MonoLabel size="text-[10px] lg:text-[11px]">{en}</MonoLabel>
      <span className="text-xs text-muted">{fa}</span>
    </div>
  );
}

function Stat({ value, label, tone = "text-ink" }: { value: React.ReactNode; label: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 lg:gap-1">
      <span className={`num text-right text-2xl font-extrabold lg:text-[28px] ${tone}`}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function TypeStat({ counts }: { counts: Record<string, number> }) {
  const movies = counts.movie ?? 0;
  const series = counts.tv_series ?? 0;
  if (movies && series) {
    return <Stat value={`${toFaDigits(movies)}+${toFaDigits(series)}`} label="فیلم + سریال" tone="text-gold" />;
  }
  if (movies) return <Stat value={toFaDigits(movies)} label="فیلم" tone="text-gold" />;
  if (series) return <Stat value={toFaDigits(series)} label="سریال" tone="text-gold" />;
  return null;
}

export default function ListDNA({ dna, itemCount }: { dna: ListDna; itemCount: number }) {
  const genres = dna.genres.slice(0, MAX_GENRES);
  const maxDecade = Math.max(0, ...dna.decades.map((d) => d.count));

  return (
    <aside
      aria-label="شناسنامه لیست"
      className="flex shrink-0 flex-col gap-[18px] rounded-[18px] border border-border bg-surface/85 p-5 lg:w-[380px] lg:gap-6 lg:rounded-[20px] lg:p-7"
    >
      <div className="flex items-baseline justify-between">
        <MonoLabel size="text-[11px] lg:text-xs">LIST DNA</MonoLabel>
        <span className="text-[13px] text-muted lg:text-sm">شناسنامه لیست</span>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <Stat value={toFaDigits(itemCount)} label="عنوان" />
        <TypeStat counts={dna.type_counts} />
        <FollowerStat />
      </div>

      {genres.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <BlockLabel en="GENRES" fa="ژانرها" />
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-md lg:h-2.5" aria-hidden="true">
            {genres.map((g, i) => (
              <div key={g.entity.id} className={GENRE_SHADES[i]} style={{ flexGrow: g.count }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <Chip key={g.entity.id} href={entityHref("genre", g.entity.slug)} tone={GENRE_CHIP}>
                {genreLabel(g.entity.title)} <span className="num mr-1">{toFaDigits(g.count)}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}

      {dna.hubs.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <BlockLabel en="HUBS" fa="پرتکرارترین آدم‌ها" />
          <div className="flex flex-wrap gap-1.5">
            {dna.hubs.map((h) => (
              <Chip key={h.entity.id} href={entityHref("person", h.entity.slug)} tone={PEOPLE_CHIP} ltr>
                {h.entity.title} ×{toFaDigits(h.count)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {dna.decades.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <BlockLabel en="DECADES" fa="دهه‌ها" />
          <div className="flex h-14 items-end gap-4">
            {dna.decades.map((d) => (
              <div key={d.decade} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 rounded ${d.count === maxDecade ? "bg-gold" : "bg-border"}`}
                  style={{ height: `${Math.max(6, Math.round((d.count / maxDecade) * 36))}px` }}
                  title={`${toFaDigits(d.count)} عنوان`}
                />
                <span className="text-xs text-muted">دهه {toFaDigits(d.decade)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
