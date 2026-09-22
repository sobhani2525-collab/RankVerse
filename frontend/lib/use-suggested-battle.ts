"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSuggestedBattle } from "@/lib/api";
import { SuggestedBattle } from "@/lib/types";

/**
 * Shared by SuggestedBattleSection and BattleAndRankings -- the latter
 * needs to know whether a battle exists *before* rendering, so it can
 * collapse its two-column layout to one column when there's no battle
 * (e.g. every guest visitor, since this only fetches for a logged-in user).
 */
export function useSuggestedBattle(entityType: string, slug: string): SuggestedBattle | null {
  const { token } = useAuth();
  const [battle, setBattle] = useState<SuggestedBattle | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getSuggestedBattle(token, entityType, slug)
      .then((data) => {
        if (!cancelled) setBattle(data);
      })
      .catch(() => {
        if (!cancelled) setBattle(null);
      });

    return () => {
      cancelled = true;
    };
  }, [token, entityType, slug]);

  return battle;
}
