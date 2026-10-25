import type { ReactNode } from "react";
import NotableRankings from "./NotableRankings";
import EntityRelatedBattles from "./EntityRelatedBattles";
import EntityLists from "./EntityLists";
import { RankingHighlight } from "@/lib/api";

/**
 * OVERVIEW graph (main column) + a 380px sidebar (battle, Notable Rankings,
 * related battles, then "IN LISTS") next to it on desktop -- same two-column
 * shape as the list detail page's own main-column/aside split
 * (app/lists/[slug]/page.tsx), stacking on mobile.
 */
export default function EntityGraphWithSidebar({
  overview,
  rankingHighlights,
  entityId,
  entityType,
  battle,
  aboveGraph,
  belowGraph,
}: {
  overview: ReactNode;
  rankingHighlights: RankingHighlight[];
  entityId: string;
  entityType: "movie" | "tv_series";
  battle?: ReactNode;
  /** Rendered at the top of the main column, above the OVERVIEW section (beside the sidebar). */
  aboveGraph?: ReactNode;
  /** Rendered in the main column under the OVERVIEW section. */
  belowGraph?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <div className="min-w-0 flex-1">
        {aboveGraph && <div className="mb-10">{aboveGraph}</div>}
        {overview}
        {belowGraph && <div className="mt-10 flex flex-col gap-10">{belowGraph}</div>}
      </div>
      <aside className="flex shrink-0 flex-col gap-6 lg:w-[380px]">
        {battle}
        <NotableRankings items={rankingHighlights} />
        <EntityRelatedBattles entityId={entityId} entityType={entityType} />
        <EntityLists entityId={entityId} variant="sidebar" />
      </aside>
    </div>
  );
}
