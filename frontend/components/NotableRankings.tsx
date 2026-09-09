import Link from "next/link";
import { RankingHighlight } from "@/lib/api";

function highlightLabel(highlight: RankingHighlight): string {
  const title = highlight.group.title;
  switch (highlight.dimension) {
    case "genre":
      return `بهترین‌های ${title}`;
    case "director":
      return `بهترین فیلم‌های ${title}`;
    default:
      return `برترین‌های ${title}`;
  }
}

// The ranking dimension name doesn't always match the entity_type used for
// routing (e.g. "director" groups are "person" entities) — map it here.
const DIMENSION_TO_ENTITY_TYPE: Record<string, string> = {
  genre: "genre",
  director: "person",
};

function highlightHref(highlight: RankingHighlight): string {
  const type = DIMENSION_TO_ENTITY_TYPE[highlight.dimension] ?? highlight.dimension;
  return `/${type}/${highlight.group.slug}`;
}

interface NotableRankingsProps {
  items: RankingHighlight[];
}

export default function NotableRankings({ items }: NotableRankingsProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">رتبه‌های قابل‌توجه</h2>
        <span className="text-xs text-muted">بر اساس امتیاز محاسبه‌شده</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((h) => (
          <Link
            key={`${h.dimension}-${h.group.id}`}
            href={highlightHref(h)}
            className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-4 py-3 transition hover:bg-surface2/70"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{highlightLabel(h)}</p>
              <p className="num mt-1 text-[11px] text-muted">از میان {h.group_size} عنوان</p>
            </div>
            <span className="num shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-medium text-gold">
              #{h.rank}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
