"use client";
import Image from "next/image";
import Link from "next/link";
import { useFavorites } from "@/contexts/FavoritesContext";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { entityHref } from "@/lib/list-constellation";

const FAVORITABLE_ENTITY_TYPES = new Set(["movie", "tv_series"]);

export interface PosterCardWhyChip {
  text: string;
  tone: "people" | "genre";
}

export interface PosterCardEntity {
  id: string;
  slug: string;
  title: string;
  title_fa?: string | null;
  entity_type: string;
  poster_path?: string | null;
  year?: number | null;
}

/**
 * Shared poster card for "ساخته‌های دیگر X" (DirectorWorks), "اگر این را
 * دوست داشتی" (RelatedEntities) and the profile page's "تماشا خواهم کرد"
 * gallery: 2:3 poster with an overlaid top-left button (blurred dark chip)
 * + title + year pill + optional WHY chips (violet for a shared person,
 * teal for a shared genre). Fixed 168px wide on mobile for a
 * horizontal-scroll row, fills its grid cell from sm: up.
 *
 * The top-left button is either the heart (favorite toggle, the default)
 * or, when `onRemove` is given, an X for pulling the item out of whatever
 * list is rendering it (watch-later) -- the two are mutually exclusive so
 * the card never shows two overlapping buttons.
 */
export default function PosterCard({
  entity,
  why = [],
  onRemove,
  fluid = false,
  rank,
}: {
  entity: PosterCardEntity;
  why?: PosterCardWhyChip[];
  onRemove?: (entity: PosterCardEntity) => void;
  // Fill the grid cell at every breakpoint instead of the fixed mobile width.
  fluid?: boolean;
  // Optional rank badge (top-right of the poster).
  rank?: number;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(entity.id);
  const showRemove = onRemove != null;
  const showFavorite = !showRemove && FAVORITABLE_ENTITY_TYPES.has(entity.entity_type);
  const href = entityHref(entity.entity_type, entity.slug) ?? `/${entity.entity_type}/${entity.slug}`;
  const posterUrl = entity.poster_path ? `https://image.tmdb.org/t/p/w342${entity.poster_path}` : null;
  const title = displayTitle(entity);

  return (
    <div className={`flex shrink-0 flex-col gap-2 ${fluid ? "w-full min-w-0" : "w-[168px] sm:w-full"}`}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface-2">
        <Link href={href} className="absolute inset-0" aria-label={title}>
          {posterUrl ? (
            <Image src={posterUrl} alt={title} fill sizes="(max-width: 768px) 168px, 220px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">بدون پوستر</div>
          )}
        </Link>

        {rank != null && (
          <span
            className="num pointer-events-none absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold text-ink backdrop-blur-sm"
            style={{ background: "rgba(10,13,20,0.72)" }}
          >
            {toFaDigits(rank)}
          </span>
        )}

        {showRemove && (
          <button
            type="button"
            aria-label="حذف از فهرست"
            onClick={(e) => {
              e.preventDefault();
              onRemove!(entity);
            }}
            className="absolute left-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm transition hover:border-rose-400"
            style={{ background: "rgba(10,13,20,0.72)", borderColor: "rgba(255,255,255,0.15)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EDEFF5"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        )}

        {showFavorite && (
          <button
            type="button"
            aria-label={favorited ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
            aria-pressed={favorited}
            onClick={(e) => {
              e.preventDefault();
              toggleFavorite(entity);
            }}
            className="absolute left-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm transition"
            style={{
              background: "rgba(10,13,20,0.72)",
              borderColor: favorited ? "#F07178" : "rgba(255,255,255,0.15)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={favorited ? "#F07178" : "none"}
              stroke={favorited ? "#F07178" : "#EDEFF5"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>
          </button>
        )}
      </div>

      <Link href={href} className="truncate text-sm font-bold text-ink transition hover:text-gold">
        {title}
      </Link>

      {entity.year != null && (
        <span className="num w-fit rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
          {toFaDigits(entity.year)}
        </span>
      )}

      {why.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {why.map((chip, i) => (
            <span
              key={i}
              className={`truncate rounded-full border px-2 py-0.5 text-[10px] ${
                chip.tone === "genre" ? "border-teal/45 text-teal" : "border-violet-light/45 text-violet-light"
              }`}
            >
              {chip.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
