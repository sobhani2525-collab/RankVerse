import type { ComponentType } from "react";
import { getPersonBySlug, getGenreBySlug } from "@/lib/api";
import PersonView from "@/components/PersonView";
import GenreView from "@/components/GenreView";

/**
 * Adding a new entity type (book, city, ...) to app/[type]/[slug]/page.tsx
 * means adding one entry here — a fetcher and a view component — with no
 * changes to the routing structure itself.
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
};
