import { SectionHeading } from "@/components/list-detail/ui";
import RankingList from "@/components/RankingList";
import PosterCard from "@/components/entities/poster-card";
import { MovieListItem } from "@/lib/types";

interface RelatedListProps {
  title?: string;
  /** English kicker shown above the title (mono, gold). */
  en?: string;
  items: MovieListItem[];
  /** "cards" renders the same poster-grid EntityCard the home page uses
   *  (for movie/tv_series credits); "rows" (default) keeps the compact
   *  ranked-row layout, still the better fit for e.g. a person's tracks. */
  display?: "rows" | "cards";
}

export default function RelatedList({ title, en, items, display = "rows" }: RelatedListProps) {
  if (items.length === 0) return null;

  return (
    <section className="mt-14">
      {title && <SectionHeading en={en ?? ""} fa={title} tone="text-gold" />}
      <div className="mt-4">
        {display === "cards" ? (
          <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:pb-0 md:grid-cols-4">
            {items.map((item) => (
              <PosterCard key={item.id} entity={item} />
            ))}
          </div>
        ) : (
          <RankingList movies={items} />
        )}
      </div>
    </section>
  );
}
