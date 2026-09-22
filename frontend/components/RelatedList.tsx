import RankingList from "@/components/RankingList";
import FavoriteEntityCard from "@/components/entities/favorite-entity-card";
import { movieListItemToEntityCard } from "@/lib/entity-card-adapters";
import { MovieListItem } from "@/lib/types";

interface RelatedListProps {
  title?: string;
  items: MovieListItem[];
  /** "cards" renders the same poster-grid EntityCard the home page uses
   *  (for movie/tv_series credits); "rows" (default) keeps the compact
   *  ranked-row layout, still the better fit for e.g. a person's tracks. */
  display?: "rows" | "cards";
}

export default function RelatedList({ title, items, display = "rows" }: RelatedListProps) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
      <div className="mt-4">
        {display === "cards" ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
            {items.map((item) => (
              <FavoriteEntityCard key={item.id} entity={movieListItemToEntityCard(item)} />
            ))}
          </div>
        ) : (
          <RankingList movies={items} />
        )}
      </div>
    </section>
  );
}
