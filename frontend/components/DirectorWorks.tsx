import Link from "next/link";
import PosterCard from "@/components/entities/poster-card";
import { SectionHeading } from "@/components/list-detail/ui";
import { entityHref } from "@/lib/list-constellation";
import { MovieListItem } from "@/lib/types";

/**
 * "ساخته‌های دیگر X" -- same PosterCard as "اگر این را دوست داری...", but
 * sourced from the director/creator's own filmography (movie/tv-series
 * detail pages already fetch it via getPersonBySlug for the suggested-
 * battle fallback, see BattleSection) rather than the similar_to graph. No
 * WHY chips here -- those need a per-item shared-connection lookup beyond
 * the director, which this data source doesn't carry.
 */
export default function DirectorWorks({
  directorName,
  directorSlug,
  items,
}: {
  directorName: string;
  directorSlug: string;
  items: MovieListItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <SectionHeading
        en="MORE BY DIRECTOR"
        fa={`ساخته‌های دیگر ${directorName}`}
        aside={
          <Link href={entityHref("person", directorSlug) ?? "#"} className="text-xs text-violet-light hover:text-ink">
            همه فیلم‌های {directorName} ←
          </Link>
        }
      />
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:pb-0 md:grid-cols-4">
        {items.slice(0, 8).map((item) => (
          <PosterCard key={item.id} entity={item} />
        ))}
      </div>
    </div>
  );
}
