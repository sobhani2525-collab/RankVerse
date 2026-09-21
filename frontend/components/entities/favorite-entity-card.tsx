"use client";
import EntityCard, { EntityCardEntity, EntityCardProps } from "./entity-card";
import { useFavorites } from "@/contexts/FavoritesContext";

// Favoriting currently shares the same backend capability surface as
// rating (POST /movies|tv-series/{slug}/favorite) -- see StarRating's
// equivalent gate on `total_votes`. EntityCardEntity doesn't carry that
// raw field (it's adapted into compositeScore/communityScore instead),
// so entity_type is the presence signal available here.
const FAVORITABLE_ENTITY_TYPES = new Set(["movie", "tv_series"]);

type FavoriteEntityCardProps = Omit<EntityCardProps, "isFavorite" | "onToggleFavorite" | "showFavoriteAction"> & {
  entity: EntityCardEntity;
};

export default function FavoriteEntityCard({ entity, ...rest }: FavoriteEntityCardProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favoritable = FAVORITABLE_ENTITY_TYPES.has(entity.entity_type);

  return (
    <EntityCard
      entity={entity}
      showFavoriteAction={favoritable}
      isFavorite={favoritable && isFavorite(entity.id)}
      onToggleFavorite={() => toggleFavorite(entity)}
      {...rest}
    />
  );
}
