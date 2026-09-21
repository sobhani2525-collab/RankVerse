"use client";

import Link from "next/link";
import EntityMedia, { MediaKind } from "./entity-media";
import { detailPathFor } from "@/lib/entity-routes";
import { displayTitle } from "@/lib/title";
import { entityTypeLabel } from "@/lib/constants";

export interface EntityCardNotableRanking {
  label: string;
  href: string;
}

export type EntityCardTrend = "up" | "down" | "flat";

/**
 * A shape every entity type (movie/tv_series/track/…) can be adapted to.
 * EntityCard activates each piece of UI purely on which of these fields is
 * present, never on entity_type -- the same "activation by data presence"
 * rule EntityHero/MediaPlayer/RelatedList already follow.
 *
 * Fields beyond the identity ones are all optional: today's list endpoints
 * (e.g. MovieListItem) only populate posterUrl/year/compositeScore, so the
 * rest (communityScore/trend/confidence/trending/notableRankings) simply
 * don't render until an API adds them -- see the mapping helpers in the
 * pages that use this component.
 */
export interface EntityCardEntity {
  id: string;
  slug: string;
  title: string;
  title_fa?: string | null;
  entity_type: string;
  year?: number | null;
  genre?: string | null;
  posterUrl?: string | null;
  mediaKind?: MediaKind;
  compositeScore?: number | null;
  communityScore?: number | null;
  trend?: EntityCardTrend | null;
  confidence?: string | null;
  trending?: boolean;
  notableRankings?: EntityCardNotableRanking[];
}

export interface EntityCardProps {
  entity: EntityCardEntity;
  showFavoriteAction?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (entity: EntityCardEntity) => void;
  /** false forces the sub-metric row to show below the md breakpoint too. */
  compact?: boolean;
}

const TREND_GLYPH: Record<EntityCardTrend, string> = { up: "↑", down: "↓", flat: "—" };
const TREND_CLASS: Record<EntityCardTrend, string> = {
  up: "text-teal",
  down: "text-rose-400",
  flat: "text-muted",
};

export default function EntityCard({
  entity,
  showFavoriteAction = true,
  isFavorite = false,
  onToggleFavorite,
  compact,
}: EntityCardProps) {
  const title = displayTitle(entity);
  const href = detailPathFor(entity.entity_type, entity.slug) ?? `/${entity.entity_type}/${entity.slug}`;
  const hasSubmetrics =
    entity.communityScore != null || entity.trend != null || entity.confidence != null;
  const submetricRowClass = compact === false ? "flex" : "hidden md:flex";
  const cornerButtonBottomClass = hasSubmetrics
    ? compact === false
      ? "bottom-9"
      : "bottom-2 md:bottom-9"
    : "bottom-2";
  const rankingChips = (entity.notableRankings ?? []).slice(0, 2);

  return (
    <div className="flex flex-col">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-border-soft bg-surface2">
        <Link href={href} className="absolute inset-0" aria-label={title}>
          <EntityMedia src={entity.posterUrl} alt={title} mediaKind={entity.mediaKind} />
        </Link>

        {entity.compositeScore != null && (
          // border-image ignores border-radius in every browser, so a
          // circular gradient ring needs the padding-trick instead: an
          // outer gradient-filled circle with a small padding, and an
          // inner solid circle covering everything but that padding.
          <div
            className="pointer-events-none absolute right-2 top-2 h-9 w-9 rounded-full p-[1.5px] md:h-10 md:w-10"
            style={{ background: "linear-gradient(135deg, #9163f5, #4FB8A6)" }}
          >
            <div
              className="num flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-ink backdrop-blur-sm md:text-sm"
              style={{ background: "rgba(7,11,22,.85)" }}
            >
              {entity.compositeScore.toFixed(1)}
            </div>
          </div>
        )}

        {showFavoriteAction && (
          <button
            type="button"
            aria-label={isFavorite ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
            onClick={(e) => {
              e.preventDefault();
              onToggleFavorite?.(entity);
            }}
            className={`absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border backdrop-blur-sm transition hover:text-gold md:h-9 md:w-9 ${
              isFavorite ? "text-gold" : "text-ink"
            }`}
            style={{ background: "rgba(7,11,22,.7)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>
          </button>
        )}

        {entity.trending === true && (
          <div
            className={`absolute right-2 flex items-center gap-1 rounded-lg border border-teal/40 px-2 py-1 backdrop-blur-sm ${cornerButtonBottomClass}`}
            style={{ background: "rgba(7,11,22,.78)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-teal" />
            <span className="text-[9px] font-semibold text-teal">پرطرفدار</span>
          </div>
        )}

        {hasSubmetrics && (
          <div
            className={`num absolute inset-x-0 bottom-0 items-center gap-1.5 px-2.5 py-1.5 text-[9px] text-muted backdrop-blur-sm ${submetricRowClass}`}
            style={{ background: "rgba(5,8,16,.72)" }}
          >
            {entity.communityScore != null && <span>c:{entity.communityScore.toFixed(1)}</span>}
            {entity.communityScore != null && entity.trend != null && <span className="opacity-40">·</span>}
            {entity.trend != null && (
              <span className={TREND_CLASS[entity.trend]}>روند {TREND_GLYPH[entity.trend]}</span>
            )}
            {(entity.communityScore != null || entity.trend != null) && entity.confidence != null && (
              <span className="opacity-40">·</span>
            )}
            {entity.confidence != null && <span>قطعیت {entity.confidence}</span>}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-col gap-1.5">
        <span className="text-[10.5px] font-semibold text-muted">{entityTypeLabel(entity.entity_type)}</span>

        <Link href={href} className="truncate text-sm font-bold text-ink hover:text-teal md:text-[15px]">
          {title}
        </Link>

        {(entity.year != null || entity.genre) && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            {entity.year != null && <span className="num">{entity.year}</span>}
            {entity.year != null && entity.genre && <span className="opacity-50">·</span>}
            {entity.genre && <span className="truncate">{entity.genre}</span>}
          </div>
        )}

        {rankingChips.length > 0 && (
          <div className="flex flex-col items-start gap-1">
            {rankingChips.map((chip, i) => (
              <Link
                key={chip.href + chip.label}
                href={chip.href}
                className={`inline-flex max-w-full items-center gap-1 truncate rounded-lg border border-gold/35 bg-gold/[.08] px-1.5 py-0.5 text-[9.5px] font-semibold text-gold hover:bg-gold/[.14] ${
                  i > 0 ? "hidden sm:inline-flex" : ""
                }`}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="shrink-0" aria-hidden="true">
                  <circle cx="2" cy="8" r="1.3" fill="currentColor" />
                  <circle cx="8" cy="2" r="1.3" fill="currentColor" />
                  <line x1="2.7" y1="7.2" x2="7.2" y2="2.8" stroke="currentColor" strokeWidth="1" />
                </svg>
                <span className="truncate">{chip.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
