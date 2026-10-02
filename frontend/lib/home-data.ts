import type { PersonListItem } from "./api";
import { MovieDetail, MovieListItem, PersonDetail, TvSeriesDetail } from "./types";

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
  directors: { slug: string; title: string; title_fa?: string | null }[];
  genres: { slug: string; title: string }[];
  cast: { slug: string; title: string; title_fa?: string | null }[];
  // Only for people: slugs of the titles they worked on.
  works?: string[];
  // Only for people: their best-scored titles, ready to be drawn next to them.
  workNodes?: HomeTitle[];
}

// Same source/fallback order as entity-card-adapters.ts' resolvePosterUrl.
export function posterUrlFor(item: { media?: { image_url: string | null } | null; poster_path: string | null }, size = "w500"): string | null {
  return item.media?.image_url ?? (item.poster_path ? `https://image.tmdb.org/t/p/${size}${item.poster_path}` : null);
}

export function toHomeTitle(item: MovieListItem, rank: number, detail?: MovieDetail | TvSeriesDetail | null): HomeTitle {
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
    directors: [...(detail && "creators" in detail ? detail.creators : []), ...(detail?.directors ?? [])].map(({ slug, title, title_fa }) => ({ slug, title, title_fa })),
    genres: detail?.genres.map(({ slug, title }) => ({ slug, title })) ?? [],
    cast: detail?.cast.slice(0, 6).map(({ slug, title, title_fa }) => ({ slug, title, title_fa })) ?? [],
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

/**
 * A ranked person as a constellation node. `works` holds the slugs of
 * everything they directed/created/acted in -- the hero graph links a
 * person to any title in `works` (empty when the detail fetch failed).
 */
export function toHomePerson(item: PersonListItem, rank: number, detail?: PersonDetail | null): HomeTitle {
  const works = detail ? [...detail.directed, ...detail.created, ...detail.acted_in].map((w) => w.slug) : [];
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    title_fa: item.title_fa ?? null,
    entity_type: "person",
    year: null,
    score: item.avg_score,
    votes: item.works_count,
    rank,
    posterUrl: item.media?.image_url ?? null,
    hasDetail: !!detail,
    directors: [],
    genres: [],
    cast: [],
    works,
    workNodes: detail
      ? [...detail.directed, ...detail.created, ...detail.acted_in]
          .filter((w, i, all) => all.findIndex((x) => x.id === w.id) === i)
          .sort((a, b) => (b.computed_score ?? 0) - (a.computed_score ?? 0))
          .slice(0, 4)
          .map((w) => toHomeTitle(w, 0))
      : [],
  };
}
