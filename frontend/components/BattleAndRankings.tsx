"use client";

import { useSuggestedBattle } from "@/lib/use-suggested-battle";
import SuggestedBattleCard from "./SuggestedBattleCard";
import NotableRankings from "./NotableRankings";
import { RankingHighlight } from "@/lib/api";

/**
 * Places the suggested-battle card and the notable-rankings list side by
 * side on desktop. Whether the battle card exists is only known client-side
 * (it needs a logged-in user with a taste anchor -- see useSuggestedBattle),
 * so this lives in one client component rather than two independent
 * server-rendered blocks: that's what lets the layout collapse to a single
 * full-width column when there's no battle, which is the case for every
 * guest visitor, instead of leaving an empty half-width gap next to
 * Notable Rankings.
 */
export default function BattleAndRankings({
  entityType,
  slug,
  rankingHighlights,
}: {
  entityType: string;
  slug: string;
  rankingHighlights: RankingHighlight[];
}) {
  const battle = useSuggestedBattle(entityType, slug);
  const hasBattle = battle != null;
  const hasRankings = rankingHighlights.length > 0;

  if (!hasBattle && !hasRankings) return null;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      {hasBattle && (
        <div className={hasRankings ? "lg:min-w-0 lg:flex-1" : "w-full"}>
          <SuggestedBattleCard battle={battle} />
        </div>
      )}
      {hasRankings && (
        <div className={hasBattle ? "lg:min-w-0 lg:flex-1" : "w-full"}>
          <NotableRankings items={rankingHighlights} />
        </div>
      )}
    </div>
  );
}
