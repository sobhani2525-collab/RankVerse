import type { ComponentType } from "react";
import { getPersonBySlug, getGenreBySlug, getTrackBySlug } from "@/lib/api";
import PersonView from "@/components/PersonView";
import GenreView from "@/components/GenreView";
import TrackView from "@/components/TrackView";

/**
 * Adding a new entity type (e.g. music) to app/[type]/[slug]/page.tsx means
 * adding one entry here — a fetcher and a view — with no routing changes.
 *
 * The "view" itself should stay a thin composition of the shared building
 * blocks (EntityHero, EntityDescription, MediaPlayer, RelatedList — see
 * PersonView.tsx/GenreView.tsx), not independent UI code. Those blocks key
 * off *data presence* (media.audio_preview_url, biography, ...), not
 * entity_type, so e.g. a music entity just needs its sync step to populate
 * media.audio_preview_url — MediaPlayer already knows how to render it.
 */
export interface EntityTypeConfig<T = unknown> {
  fetch: (slug: string) => Promise<T>;
  Component: ComponentType<{ data: T }>;
}

function defineEntityType<T>(config: EntityTypeConfig<T>): EntityTypeConfig<T> {
  return config;
}

export const ENTITY_TYPE_REGISTRY: Record<string, EntityTypeConfig<any>> = {
  person: defineEntityType({ fetch: getPersonBySlug, Component: PersonView }),
  genre: defineEntityType({ fetch: getGenreBySlug, Component: GenreView }),
  track: defineEntityType({ fetch: getTrackBySlug, Component: TrackView }),
};
