"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getMyPredictedPicks } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/contexts/FavoritesContext";
import type { PredictedPick } from "@/lib/types";

const HomePicksContext = createContext<PredictedPick[] | null>(null);
const subscribeToHydration = () => () => {};

export function useHomePicks() {
  const picks = useContext(HomePicksContext);
  // The auth provider can resolve before a streamed home section hydrates.
  // Each consumer must initially match its own anonymous server markup.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  return hydrated ? picks : null;
}

export function HomePicksProvider({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, getToken } = useAuth();
  const { screenFavoritesRevision } = useFavorites();
  const userId = !loading && isAuthenticated ? user?.id : undefined;
  const [result, setResult] = useState<{ userId: string; picks: PredictedPick[] } | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!userId || !token) {
      setResult(null);
      return;
    }
    let current = true;
    getMyPredictedPicks(token, 5)
      .then((picks) => { if (current) setResult({ userId, picks }); })
      .catch(() => { if (current) setResult({ userId, picks: [] }); });
    return () => { current = false; };
  }, [userId, getToken, screenFavoritesRevision]);

  return (
    <HomePicksContext.Provider value={result && result.userId === userId ? result.picks : null}>
      {children}
    </HomePicksContext.Provider>
  );
}
