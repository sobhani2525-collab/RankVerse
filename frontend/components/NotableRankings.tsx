import Link from "next/link";
import { RankingHighlight } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

function highlightLabel(highlight: RankingHighlight): string {
  const title = highlight.group.title;
  switch (highlight.dimension) {
    case "genre":
      return `بهترین‌های ${genreLabel(title)}`;
    case "director":
      return `بهترین فیلم‌های ${title}`;
    case "creator":
      return `بهترین سریال‌های ${title}`;
    default:
      return `برترین‌های ${title}`;
  }
}

// The ranking dimension name doesn't always match the entity_type used for
// routing (e.g. "director"/"creator" groups are both "person" entities) —
// map it here.
const DIMENSION_TO_ENTITY_TYPE: Record<string, string> = {
  genre: "genre",
  director: "person",
  creator: "person",
};

function highlightHref(highlight: RankingHighlight): string {
  const type = DIMENSION_TO_ENTITY_TYPE[highlight.dimension] ?? highlight.dimension;
  return `/${type}/${highlight.group.slug}`;
}

// A small per-dimension glyph so the list reads as a set of distinct
// achievements rather than identical rows -- genre/director/creator each
// get their own icon, anything else falls back to a plain star.
const DIMENSION_ICON: Record<string, React.ReactNode> = {
  genre: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="5" />
      <path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5" />
    </svg>
  ),
  director: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="9" width="18" height="12" rx="1.5" />
      <path d="M3 9l1.5-5h4L7 9M11 9l1.5-5h4L15 9" />
    </svg>
  ),
  creator: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 3l4 4 4-4" />
    </svg>
  ),
};

const DEFAULT_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
  </svg>
);

interface NotableRankingsProps {
  items: RankingHighlight[];
}

export default function NotableRankings({ items }: NotableRankingsProps) {
  if (items.length === 0) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* mx-auto keeps the list centered (not flush against one edge with a
          dead gap beside it) whenever this is the sole section in its row.
          When it's paired with the battle card in a half-width flex column,
          that column is already narrower than max-w-2xl, so mx-auto has
          nothing to center against and is a no-op there. */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">رتبه‌های قابل‌توجه</h2>
        <span className="text-xs text-muted">بر اساس امتیاز محاسبه‌شده</span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {items.map((h) => {
          const isTop = h.rank === 1;
          return (
            <Link
              key={`${h.dimension}-${h.group.id}`}
              href={highlightHref(h)}
              className="group flex items-center gap-3 rounded-xl border border-transparent bg-surface2 px-4 py-3 transition hover:border-gold/30 hover:bg-surface2/70"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-ink">
                {DIMENSION_ICON[h.dimension] ?? DEFAULT_ICON}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{highlightLabel(h)}</p>
                <p className="mt-1 text-[11px] text-muted">
                  از میان <span className="num">{toFaDigits(h.group_size)}</span> عنوان
                </p>
              </div>

              {isTop ? (
                <div
                  className="h-11 w-11 shrink-0 rounded-full p-[1.5px]"
                  style={{ background: "linear-gradient(135deg, #E8B34A, #9163f5)" }}
                >
                  <div className="num flex h-full w-full items-center justify-center rounded-full bg-bg text-sm font-bold text-gold">
                    #{h.rank}
                  </div>
                </div>
              ) : (
                <span className="num shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-medium text-gold transition group-hover:border-gold/60">
                  #{h.rank}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
