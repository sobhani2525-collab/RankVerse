import { MovieListItem, ListSummary } from "./types";
import { EntityCardEntity } from "@/components/entities/entity-card";
import { ListCardList } from "@/components/lists/list-card";

// media.image_url is the standard source; poster_path is a fallback for
// entities synced before that field existed (same convention EntityRow.tsx
// and the movie/tv-series detail pages use).
function resolvePosterUrl(item: MovieListItem): string | null {
  return item.media.image_url ?? (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null);
}

/**
 * Adapts a MovieListItem (movie/tv_series rows from /rankings/*) into the
 * generic EntityCardEntity shape. communityScore/trend/confidence/trending/
 * notableRankings have no equivalent on MovieListItem yet, so they're left
 * undefined -- EntityCard already hides each of those sections when absent.
 */
export function movieListItemToEntityCard(item: MovieListItem): EntityCardEntity {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    title_fa: item.title_fa,
    entity_type: item.entity_type,
    year: item.year,
    posterUrl: resolvePosterUrl(item),
    mediaKind: "image",
    compositeScore: item.computed_score,
  };
}

/**
 * Adapts a ListSummary (from /lists) into ListCardList. `items` and
 * `countsByType` stay undefined -- ListSummary carries no per-item data
 * (no item posters, no per-type breakdown), only a single `entity_type`
 * and aggregate counters, so ListCard's collage renders as placeholders
 * and the type-count badges are simply omitted until the endpoint grows
 * a preview-items field. `updatedAt` falls back to `created_at` since
 * ListSummary has no separate "last updated" timestamp.
 */
export function listSummaryToListCard(list: ListSummary): ListCardList {
  return {
    id: list.id,
    slug: list.slug,
    title: list.title,
    likesCount: list.like_count,
    updatedAt: list.created_at,
    author: list.owner_username ? { username: list.owner_username } : null,
  };
}
