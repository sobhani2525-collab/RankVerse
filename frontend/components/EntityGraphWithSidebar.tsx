import EntityGraphSection from "./EntityGraphSection";
import NotableRankings from "./NotableRankings";
import EntityLists from "./EntityLists";
import { RankingHighlight } from "@/lib/api";
import { PersonSummary, GenreSummary } from "@/lib/types";

interface PeopleRow {
  label: string;
  people: PersonSummary[];
}

/**
 * GRAPH timeline (main column) + a 380px sidebar (Notable Rankings, then
 * "IN LISTS") next to it on desktop -- same two-column shape as the list
 * detail page's own main-column/aside split (app/lists/[slug]/page.tsx),
 * stacking on mobile.
 */
export default function EntityGraphWithSidebar({
  entityType,
  peopleRows,
  cast,
  genres,
  year,
  rankingHighlights,
  entityId,
}: {
  entityType: string;
  peopleRows: PeopleRow[];
  cast: PersonSummary[];
  genres: GenreSummary[];
  year: number | null;
  rankingHighlights: RankingHighlight[];
  entityId: string;
}) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="min-w-0 flex-1">
        <EntityGraphSection entityType={entityType} peopleRows={peopleRows} cast={cast} genres={genres} year={year} />
      </div>
      <aside className="flex shrink-0 flex-col gap-6 lg:w-[380px]">
        <NotableRankings items={rankingHighlights} />
        <EntityLists entityId={entityId} variant="sidebar" />
      </aside>
    </div>
  );
}
