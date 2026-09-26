import PosterCard, { PosterCardWhyChip } from "@/components/entities/poster-card";
import { SectionHeading } from "@/components/list-detail/ui";
import { RelatedEntity } from "@/lib/api";

interface RelatedEntitiesProps {
  items: RelatedEntity[];
  /** Ids already shown in "ساخته‌های دیگر X" (DirectorWorks) -- filtered out
   *  here so the two sections don't repeat the same title. */
  excludeIds?: string[];
}

// build_reason() (app/modules/recommendations/router.py) joins its parts
// with " • ": a shared-director/shared-actor sentence (people, violet) and/
// or a "ژانر مشترک: ..." sentence (genre, teal), or a generic fallback
// sentence when nothing specific was found -- that fallback isn't worth a
// chip of its own.
const GENERIC_REASON = "بر اساس شباهت کلی در گراف دانش";

function whyChipsFor(reason: string | null): PosterCardWhyChip[] {
  if (!reason || reason === GENERIC_REASON) return [];
  return reason
    .split(" • ")
    .map((text): PosterCardWhyChip => ({ text, tone: text.startsWith("ژانر مشترک") ? "genre" : "people" }));
}

export default function RelatedEntities({ items, excludeIds = [] }: RelatedEntitiesProps) {
  const excluded = new Set(excludeIds);
  const shown = items.filter((item) => !excluded.has(item.id));
  if (shown.length === 0) return null;

  return (
    <div>
      <SectionHeading
        en="IF YOU LIKED"
        fa="اگر این را دوست داشتی"
        aside={<span className="text-xs text-dim">بر اساس اتصال‌های واقعی گراف، نه جعبه سیاه</span>}
      />
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:pb-0 md:grid-cols-4">
        {shown.map((item) => (
          <PosterCard key={item.id} entity={item} why={whyChipsFor(item.reason)} />
        ))}
      </div>
    </div>
  );
}
