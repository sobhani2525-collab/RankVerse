import PosterCard from "@/components/entities/poster-card";
import { SectionHeading } from "@/components/list-detail/ui";
import { RelatedEntity } from "@/lib/api";

interface RelatedEntitiesProps {
  items: RelatedEntity[];
  /** Ids already shown in "ساخته‌های دیگر X" (DirectorWorks) -- filtered out
   *  here so the two sections don't repeat the same title. */
  excludeIds?: string[];
  tone?: string;
}

export default function RelatedEntities({ items, excludeIds = [], tone }: RelatedEntitiesProps) {
  const excluded = new Set(excludeIds);
  const shown = items.filter((item) => !excluded.has(item.id));
  if (shown.length === 0) return null;

  return (
    <div>
      <SectionHeading en="IF YOU LIKED" fa="اگر این را دوست داشتی" tone={tone} />
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:pb-0 md:grid-cols-4">
        {shown.map((item) => (
          <PosterCard key={item.id} entity={item} />
        ))}
      </div>
    </div>
  );
}
