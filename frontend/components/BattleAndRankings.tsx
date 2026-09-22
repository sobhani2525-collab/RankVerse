"use client";

import { useSuggestedBattle } from "@/lib/use-suggested-battle";
import SuggestedBattleCard from "./SuggestedBattleCard";
import NotableRankings from "./NotableRankings";
import { RankingHighlight } from "@/lib/api";
import { SuggestedBattle } from "@/lib/types";

/**
 * Places the suggested-battle card and the notable-rankings list side by
 * side on desktop. Whether the *personalized* battle card exists is only
 * known client-side (it needs a logged-in user with a taste anchor -- see
 * useSuggestedBattle) and is null for every guest visitor, so the caller
 * (movies/tv-series detail pages) precomputes a `fallbackBattle` server-side
 * -- the current title vs. another work by its own director/creator, from
 * the same getPersonBySlug call DirectorWorks uses -- so the card still
 * shows something rather than nothing when there's no personalized pick.
 * This lives in one client component rather than two independent
 * server-rendered blocks so the layout can still collapse to a single
 * full-width column when there's truly no battle at all (no director data
 * either), instead of leaving an empty half-width gap next to Notable
 * Rankings.
 */
export default function BattleAndRankings({
  entityType,
  slug,
  rankingHighlights,
  fallbackBattle = null,
}: {
  entityType: string;
  slug: string;
  rankingHighlights: RankingHighlight[];
  fallbackBattle?: SuggestedBattle | null;
}) {
  const personalizedBattle = useSuggestedBattle(entityType, slug);
  const battle = personalizedBattle ?? fallbackBattle;
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
