import FavoriteEntityCard from "@/components/entities/favorite-entity-card";
import { movieListItemToEntityCard } from "@/lib/entity-card-adapters";
import { MovieListItem } from "@/lib/types";

/**
 * "ساخته‌های دیگر X" -- same card grid as "اگر این را دوست داری...", but
 * sourced from the director/creator's own filmography (movie/tv-series
 * detail pages already fetch it via getPersonBySlug for the suggested-
 * battle fallback, see BattleAndRankings) rather than the similar_to graph.
 */
export default function DirectorWorks({
  directorName,
  items,
}: {
  directorName: string;
  items: MovieListItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">ساخته‌های دیگر {directorName}</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
        {items.slice(0, 6).map((item) => (
          <FavoriteEntityCard key={item.id} entity={movieListItemToEntityCard(item)} />
        ))}
      </div>
    </div>
  );
}
