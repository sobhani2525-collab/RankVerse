import { MovieDetail, MovieListItem } from "./types";

/**
 * One ranked title as the home page's sections see it: the /rankings row
 * plus whatever its detail endpoint added (directors/genres/cast). The
 * relation arrays are empty -- never guessed -- when the detail fetch for
 * that title failed or wasn't made (only the top few get one), so every
 * consumer must treat them as optional data, not as "has no director".
 */
export interface HomeTitle {
  id: string;
  slug: string;
  title: string;
  title_fa: string | null;
  entity_type: string;
  year: number | null;
  score: number | null;
  votes: number;
  rank: number;
  posterUrl: string | null;
  hasDetail: boolean;
  directors: { slug: string; title: string }[];
  genres: { slug: string; title: string }[];
  cast: { slug: string; title: string }[];
}

// Same source/fallback order as entity-card-adapters.ts' resolvePosterUrl.
export function posterUrlFor(item: { media?: { image_url: string | null } | null; poster_path: string | null }, size = "w500"): string | null {
  return item.media?.image_url ?? (item.poster_path ? `https://image.tmdb.org/t/p/${size}${item.poster_path}` : null);
}

export function toHomeTitle(item: MovieListItem, rank: number, detail?: MovieDetail | null): HomeTitle {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    title_fa: item.title_fa,
    entity_type: item.entity_type,
    year: item.year,
    score: item.computed_score,
    votes: item.total_votes,
    rank,
    posterUrl: posterUrlFor(item),
    hasDetail: !!detail,
    directors: detail?.directors.map(({ slug, title }) => ({ slug, title })) ?? [],
    genres: detail?.genres.map(({ slug, title }) => ({ slug, title })) ?? [],
    cast: detail?.cast.slice(0, 6).map(({ slug, title }) => ({ slug, title })) ?? [],
  };
}

export interface GenreCluster {
  slug: string;
  title: string;
  titles: HomeTitle[];
}

/**
 * Groups the detailed top titles by genre. Counts are "how many of these
 * N top titles carry this genre" -- the only count the loaded data can
 * support honestly (GET /genres/{slug} caps its lists at 50, so it can't
 * give a catalog-wide total either).
 */
export function clusterByGenre(titles: HomeTitle[]): GenreCluster[] {
  const map = new Map<string, GenreCluster>();
  for (const t of titles) {
    for (const g of t.genres) {
      const cluster = map.get(g.slug) ?? { slug: g.slug, title: g.title, titles: [] };
      cluster.titles.push(t);
      map.set(g.slug, cluster);
    }
  }
  return [...map.values()].sort((a, b) => b.titles.length - a.titles.length || a.title.localeCompare(b.title));
}
