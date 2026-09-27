import Link from "next/link";
import { RankingHighlight } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { SectionHeading } from "@/components/list-detail/ui";

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

interface NotableRankingsProps {
  items: RankingHighlight[];
}

export default function NotableRankings({ items }: NotableRankingsProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <SectionHeading en="NOTABLE RANKINGS" fa="جایگاه‌های برجسته" />

      <div className="mt-2 flex flex-col">
        {items.map((h, i) => (
          <Link
            key={`${h.dimension}-${h.group.id}`}
            href={highlightHref(h)}
            className={`group flex items-center gap-4 py-4 transition hover:opacity-80 ${i > 0 ? "border-t border-border-soft" : ""}`}
          >
            <span className="num shrink-0 text-xl font-extrabold text-gold">#{h.rank}</span>
            <span className="min-w-0 flex-1 truncate text-base font-bold text-ink">{highlightLabel(h)}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-dim transition group-hover:text-gold">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
