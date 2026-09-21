"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toggleFavorite as apiToggleFavorite, getMyFavorites } from "@/lib/api";

export interface FavoritableEntity {
  id: string;
  slug: string;
  entity_type: string;
}

interface FavoritesContextType {
  isFavorite: (entityId: string) => boolean;
  toggleFavorite: (entity: FavoritableEntity) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

/**
 * A ♥ favorite is a separate, lighter-weight signal from the 5-star
 * rating (see backend UserFavorite model) -- this context is the
 * frontend half: one fetch of the user's favorited entity ids per
 * session (not per card), plus an optimistic toggle with rollback on
 * error, same pattern as StarRating's rating submit.
 */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { token, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setFavoriteIds(new Set());
      return;
    }
    getMyFavorites(token)
      .then((favorites) => setFavoriteIds(new Set(favorites.map((f) => f.entity_id))))
      .catch(() => {});
  }, [token]);

  function isFavorite(entityId: string): boolean {
    return favoriteIds.has(entityId);
  }

  async function doToggle(entity: FavoritableEntity) {
    const authToken = getToken();
    if (!authToken) return;

    const wasFavorite = favoriteIds.has(entity.id);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) next.delete(entity.id);
      else next.add(entity.id);
      return next;
    });

    try {
      await apiToggleFavorite(authToken, entity.slug, entity.entity_type);
    } catch {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.add(entity.id);
        else next.delete(entity.id);
        return next;
      });
    }
  }

  function toggleFavorite(entity: FavoritableEntity) {
    requireAuth(() => doToggle(entity));
  }

  return (
    <FavoritesContext.Provider value={{ isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
