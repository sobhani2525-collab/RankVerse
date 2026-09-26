"use client";
import { useFavorites } from "@/contexts/FavoritesContext";

export interface DetailFavoriteEntity {
  id: string;
  slug: string;
  entity_type: string;
}

/**
 * The ♥ toggle for a movie/tv-series detail page header -- same heart
 * glyph and behavior as EntityCard's corner button (FavoritesContext),
 * just sized to stand alone rather than overlay a poster corner.
 */
export default function DetailFavoriteButton({
  entity,
  size = 44,
  shape = "circle",
}: {
  entity: DetailFavoriteEntity;
  size?: number;
  /** "square" = the Constellation-style hero's rounded-square action buttons,
   *  with the filled-red "liked" treatment from that design instead of gold. */
  shape?: "circle" | "square";
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(entity.id);

  const shapeClass = shape === "square" ? "rounded-xl" : "rounded-full";
  const toneClass =
    shape === "square"
      ? favorited
        ? "border-[#F07178] bg-[rgba(240,113,120,0.14)] text-[#F07178]"
        : "border-border bg-surface text-ink hover:border-[#F07178]/40"
      : favorited
        ? "border-border bg-surface/60 text-gold"
        : "border-border bg-surface/60 text-muted hover:border-gold/40";

  return (
    <button
      type="button"
      aria-label={favorited ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
      onClick={() => toggleFavorite(entity)}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center border transition ${shapeClass} ${toneClass}`}
    >
      <svg
        width={size * 0.4}
        height={size * 0.4}
        viewBox="0 0 24 24"
        fill={favorited ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}
