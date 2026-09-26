"use client";

import { useSuggestedBattle } from "@/lib/use-suggested-battle";
import SuggestedBattleCard from "./SuggestedBattleCard";
import { ENTITY_BATTLE_SECTION_ID } from "@/components/entities/battle-jump-button";
import { SuggestedBattle } from "@/lib/types";

/**
 * The in-page "نبرد" section, anchored so the hero's swords-icon button can
 * jump to it. Whether the *personalized* battle exists is only known
 * client-side (needs a logged-in user with a taste anchor -- see
 * useSuggestedBattle) and is null for every guest visitor, so the caller
 * (movies/tv-series detail pages) precomputes a `fallbackBattle` server-side
 * -- the current title vs. another work by its own director/creator, from
 * the same getPersonBySlug call DirectorWorks uses -- so the section still
 * shows something rather than nothing when there's no personalized pick.
 */
export default function BattleSection({
  entityType,
  slug,
  fallbackBattle = null,
  directorName = null,
}: {
  entityType: string;
  slug: string;
  fallbackBattle?: SuggestedBattle | null;
  /** Used only to label *why* the fallback pairing was picked ("هر دو ساخته
   *  X") -- the personalized pick from useSuggestedBattle has no single
   *  reason to show (it could be director, cast or genre), so it gets a
   *  generic graph-based label instead. */
  directorName?: string | null;
}) {
  const personalizedBattle = useSuggestedBattle(entityType, slug);
  const usingFallback = personalizedBattle == null && fallbackBattle != null;
  const battle = personalizedBattle ?? fallbackBattle;

  if (battle == null) return null;

  const reason =
    usingFallback && directorName
      ? { text: `هر دو ساخته ${directorName}`, tone: "people" as const }
      : personalizedBattle
        ? { text: "بر اساس گراف دانش و سلیقه شما", tone: "people" as const }
        : null;

  return (
    <div id={ENTITY_BATTLE_SECTION_ID} className="scroll-mt-24">
      <SuggestedBattleCard battle={battle} reason={reason} />
    </div>
  );
}
