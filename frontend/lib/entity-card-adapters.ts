import { MovieListItem, ListSummary, EntityMini } from "./types";
import { EntityCardEntity } from "@/components/entities/entity-card";
import { ListCardItem, ListCardList } from "@/components/lists/list-card";

// media.image_url is the standard source; poster_path is a fallback for
// entities synced before that field existed (same convention EntityRow.tsx
// and the movie/tv-series detail pages use).
function resolvePosterUrl(item: MovieListItem): string | null {
  return item.media.image_url ?? (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null);
}

function resolveEntityMiniPosterUrl(entity: EntityMini): string | null {
  return entity.poster_path ? `https://image.tmdb.org/t/p/w300${entity.poster_path}` : null;
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
 * Adapts a ListSummary (from /lists) into ListCardList. `items` comes from
 * `preview_items` (up to 3, position order -- see the backend's
 * ListService._to_summary_with_preview), so the collage shows real posters
 * when the list has items and falls back to placeholders for the rest.
 * `countsByType` stays undefined -- no list summary endpoint returns a
 * per-type breakdown yet, only a single `entity_type` and aggregate
 * counters, so the type-count badges are simply omitted for now.
 * `updatedAt` falls back to `created_at` since ListSummary has no separate
 * "last updated" timestamp.
 */
export function listSummaryToListCard(list: ListSummary): ListCardList {
  const items: ListCardItem[] = list.preview_items.map((entity) => ({
    id: entity.id,
    title: entity.title,
    slug: entity.slug,
    entity_type: entity.entity_type,
    posterUrl: resolveEntityMiniPosterUrl(entity),
    mediaKind: "image",
  }));

  return {
    id: list.id,
    slug: list.slug,
    title: list.title,
    items,
    likesCount: list.like_count,
    updatedAt: list.created_at,
    author: list.owner_username
      ? { username: list.owner_username, profileHref: `/profile/${list.owner_username}` }
      : null,
  };
}
