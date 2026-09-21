import Image from "next/image";
import ScoreBadge from "@/components/ScoreBadge";
import { entityTypeLabel } from "@/lib/constants";

export interface ListPreviewItem {
  id: string;
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
}

const POSTER_SLOTS = 4;

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

      <div className="mt-4 grid grid-cols-4 gap-2">
        {Array.from({ length: POSTER_SLOTS }).map((_, i) => {
          const item = pendingItems[i];
          if (!item) {
            return (
              <div
                key={`empty-${i}`}
                className="aspect-[2/3] rounded-lg border border-dashed border-border/50 bg-surface/30"
              />
            );
          }
          return <PosterSlot key={item.id} item={item} />;
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="num text-xs text-muted">{pendingItems.length} آیتم</span>
      </div>
    </div>
  );
}

function PosterSlot({ item }: { item: ListPreviewItem }) {
  return (
    <div className="animate-pop-in flex flex-col gap-1">
      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-surface2">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={item.name}
            width={96}
            height={144}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-constellation-gradient px-1 text-center text-[10px] text-ink/90">
            {item.name}
          </div>
        )}
      </div>
      {item.entity_type && (
        <span className="truncate text-[9px] font-semibold text-muted">{entityTypeLabel(item.entity_type)}</span>
      )}
    </div>
  );
}
