// entity_type -> route prefix, for every type this app can navigate to.
// movie/tv_series have their own dedicated routes; person/genre/track go
// through the polymorphic [type]/[slug] page (see lib/entity-registry.tsx).
// A type not in here has nowhere to link to (album, production_company).
export const DETAIL_PATH_BY_TYPE: Record<string, string> = {
  movie: "/movies",
  tv_series: "/tv-series",
  person: "/person",
  genre: "/genre",
  track: "/track",
};

export function detailPathFor(entityType: string, slug: string): string | null {
  const basePath = DETAIL_PATH_BY_TYPE[entityType];
  return basePath ? `${basePath}/${slug}` : null;
}
