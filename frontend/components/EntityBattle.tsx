"use client";
import { useMemo, useState } from "react";
import type { MovieListItem } from "@/lib/types";
import { BattleRun } from "@/components/PersonBattle";
import { ENTITY_BATTLE_SECTION_ID } from "@/components/entities/battle-jump-button";

/**
 * The movie / series page's BATTLE section: the person page's "winner stays"
 * run, but it always opens with the title of the page as the first champion,
 * facing its siblings (same type, weakest first).
 */
export default function EntityBattle({
  current,
  opponents,
  label,
}: {
  current: MovieListItem;
  opponents: MovieListItem[];
  label: string;
}) {
  const [runId, setRunId] = useState(0);

  const domain = useMemo(() => {
    const sameType = opponents.filter((o) => o.id !== current.id && o.entity_type === current.entity_type);
    const scored = sameType.filter((o) => o.computed_score != null);
    const pool = scored.length >= 1 ? scored : sameType;
    const sorted = [...pool].sort((a, b) => (a.computed_score ?? 0) - (b.computed_score ?? 0));
    return { key: "entity", label, note: "با این اثر شروع می‌شود", items: [current, ...sorted] };
  }, [current, opponents, label]);

  if (domain.items.length < 2) return null;

  return (
    <section id={ENTITY_BATTLE_SECTION_ID} aria-labelledby="person-battle-heading" className="flex scroll-mt-24 flex-col gap-4">
      <BattleRun key={runId} domain={domain} onAgain={() => setRunId((n) => n + 1)} />
    </section>
  );
}
