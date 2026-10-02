import type { ReactNode } from "react";
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
  battle,
  belowGraph,
}: {
  entityType: string;
  peopleRows: PeopleRow[];
  cast: PersonSummary[];
  genres: GenreSummary[];
  year: number | null;
  rankingHighlights: RankingHighlight[];
  entityId: string;
  battle?: ReactNode;
  /** Rendered in the main column under the GRAPH section. */
  belowGraph?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="min-w-0 flex-1">
        <EntityGraphSection entityType={entityType} peopleRows={peopleRows} cast={cast} genres={genres} year={year} />
        {belowGraph && <div className="mt-10 flex flex-col gap-10">{belowGraph}</div>}
      </div>
      <aside className="flex shrink-0 flex-col gap-6 lg:w-[380px]">
        {battle}
        <NotableRankings items={rankingHighlights} />
        <EntityLists entityId={entityId} variant="sidebar" />
      </aside>
    </div>
  );
}
