"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getSuggestedBattle } from "@/lib/api";
import { SuggestedBattle } from "@/lib/types";
import SuggestedBattleCard from "./SuggestedBattleCard";

/**
 * Only meaningful for a logged-in user with a taste anchor -- for a guest,
 * skips the fetch entirely (the backend would return null anyway, but
 * there's no reason to make the call). Silently renders nothing on error
 * or when there's no suggestion, same as TastePredictedPicksCard: this is
 * a supplementary discovery feature, not core page content worth an
 * error state of its own.
 */
export default function SuggestedBattleSection({
  entityType,
  slug,
}: {
  entityType: string;
  slug: string;
}) {
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

  if (!battle) return null;

  return <SuggestedBattleCard battle={battle} />;
}
