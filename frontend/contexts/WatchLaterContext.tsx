"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toggleWatchLater as apiToggleWatchLater, getWatchLaterEntityIds } from "@/lib/api";

interface WatchLaterContextType {
  isWatchLater: (entityId: string) => boolean;
  toggleWatchLater: (entityId: string) => void;
}

const WatchLaterContext = createContext<WatchLaterContextType | undefined>(undefined);

/**
 * "بعدا تماشا خواهم کرد" -- a bookmark toggle backed by the user's single
 * private watch-later list (see ListService.get_or_create_watch_later_list).
 * Same shape as FavoritesContext: one fetch of the entity ids per session,
 * optimistic toggle with rollback on error.
 */
export function WatchLaterProvider({ children }: { children: ReactNode }) {
  const { token, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [entityIds, setEntityIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setEntityIds(new Set());
      return;
    }
    getWatchLaterEntityIds(token)
      .then((ids) => setEntityIds(new Set(ids)))
      .catch(() => {});
  }, [token]);

  function isWatchLater(entityId: string): boolean {
    return entityIds.has(entityId);
  }

  async function doToggle(entityId: string) {
    const authToken = getToken();
    if (!authToken) return;

    const wasIn = entityIds.has(entityId);
    setEntityIds((prev) => {
      const next = new Set(prev);
      if (wasIn) next.delete(entityId);
      else next.add(entityId);
      return next;
    });

    try {
      await apiToggleWatchLater(authToken, entityId);
    } catch {
      setEntityIds((prev) => {
        const next = new Set(prev);
        if (wasIn) next.add(entityId);
        else next.delete(entityId);
        return next;
      });
    }
  }

  function toggleWatchLater(entityId: string) {
    requireAuth(() => doToggle(entityId));
  }

  return (
    <WatchLaterContext.Provider value={{ isWatchLater, toggleWatchLater }}>
      {children}
    </WatchLaterContext.Provider>
  );
}

export function useWatchLater() {
  const ctx = useContext(WatchLaterContext);
  if (!ctx) throw new Error("useWatchLater must be used within WatchLaterProvider");
  return ctx;
}
