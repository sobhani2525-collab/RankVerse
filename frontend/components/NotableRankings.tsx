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
          <div
            key={`${h.dimension}-${h.group.id}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-surface2 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{highlightLabel(h)}</p>
              <p className="num mt-1 text-[11px] text-muted">از میان {h.group_size} عنوان</p>
            </div>
            <span className="num shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-medium text-gold">
              #{h.rank}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
