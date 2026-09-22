import ScoreBadge from "@/components/ScoreBadge";
import EntityCard from "@/components/entities/entity-card";
import { toFaDigits } from "@/lib/format-number";

export interface ListPreviewItem {
  id: string;
  slug: string;
  name: string;
  entity_type?: string | null;
  posterUrl?: string | null;
  score?: number | null;
}

export interface ListPreviewCardProps {
  title: string;
  description?: string | null;
  pendingItems: ListPreviewItem[];
  ownerName?: string | null;
  onRemoveItem?: (id: string) => void;
}

/**
 * Renders a list as a card -- live preview while composing a new list
 * (NewListForm) today, but built to double as the list card on
 * explore/search once those pages want poster grids too: it only takes
 * plain title/description/items/owner, nothing tied to the "new list" flow.
 */
export default function ListPreviewCard({
  title,
  description,
  pendingItems,
  ownerName,
  onRemoveItem,
}: ListPreviewCardProps) {
  const isLive = title.trim().length > 0;
  const scored = pendingItems.filter((item) => item.score !== null && item.score !== undefined);
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, item) => sum + (item.score as number), 0) / scored.length
      : null;

  return (
    <div
      className={`rounded-2xl p-6 transition-all duration-300 ${
        isLive
          ? "border-2 border-violet/50 bg-surface/40 shadow-lg shadow-violet/10"
          : "border-2 border-dashed border-border/60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`text-lg font-bold ${
            isLive ? "text-ink" : "italic text-muted"
          }`}
        >
          {isLive ? title : "عنوان لیست همین‌جا ظاهر می‌شه…"}
        </h3>
        {avgScore !== null && <ScoreBadge score={avgScore} />}
      </div>

      {ownerName && <p className="mt-1 text-xs text-teal">@{ownerName}</p>}

      {description && <p className="mt-2 line-clamp-2 text-sm text-muted">{description}</p>}

      {pendingItems.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {pendingItems.map((item) => (
            <div key={item.id} className="relative">
              <EntityCard
                showFavoriteAction={false}
                entity={{
                  id: item.id,
                  slug: item.slug,
                  title: item.name,
                  entity_type: item.entity_type ?? "movie",
                  posterUrl: item.posterUrl,
                }}
              />
              {onRemoveItem && (
                <button
                  type="button"
                  aria-label="حذف از پیش‌نمایش"
                  onClick={() => onRemoveItem(item.id)}
                  className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink backdrop-blur-sm transition hover:border-gold/50 hover:text-gold md:h-9 md:w-9"
                  style={{ background: "rgba(7,11,22,.7)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border/50 bg-surface/30 py-8 text-center text-xs text-muted">
          آیتمی اضافه نشده
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">
          <span className="num">{toFaDigits(pendingItems.length)}</span> آیتم
        </span>
      </div>
    </div>
  );
}
