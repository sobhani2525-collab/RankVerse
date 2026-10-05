import type { Metadata } from "next";
import { SITE_LOCALE, SITE_NAME, absoluteUrl, excerpt } from "@/lib/site";
import { toFaDigits } from "@/lib/format-number";
import { genreLabel } from "@/lib/genre-labels";
import type { GenreDetail, MovieDetail, PersonDetail, TvSeriesDetail } from "@/lib/types";

const TMDB_IMG = "https://image.tmdb.org/t/p";
const DESC_MAX = 160;

function tmdb(path: string | null | undefined, size: string): string | null {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}

function names(people: { title: string; title_fa?: string | null }[], max: number): string[] {
  return people.slice(0, max).map((p) => p.title_fa || p.title);
}

function score(value: number | null | undefined): string | null {
  return value == null ? null : toFaDigits(value.toFixed(1));
}

interface PageMeta {
  title: string;
  description: string;
  path: string;
  image: string | null;
  ogType: "video.movie" | "video.tv_show" | "profile" | "website";
  index?: boolean;
}

function buildMetadata({ title, description, path, image, ogType, index = true }: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: ogType,
      url: path,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

/** "رستگاری در شاوشنک (۱۹۹۴)": Persian title when there is one, plus the year. */
function titleWithYear(entity: { title: string; title_fa?: string | null; year?: number | null }): string {
  const base = entity.title_fa || entity.title;
  return entity.year ? `${base} (${toFaDigits(entity.year)})` : base;
}

function mediaDescription(
  kind: "فیلم" | "سریال",
  d: MovieDetail | TvSeriesDetail,
  people: { label: string; list: { title: string; title_fa?: string | null }[] }[],
): string {
  const parts: string[] = [];
  const rating = score(d.computed_score);
  parts.push(
    `${kind} ${titleWithYear(d)}${rating ? ` با امتیاز ترکیبی ${rating} از ۱۰ در ${SITE_NAME}` : ` در ${SITE_NAME}`}.`,
  );
  const genres = d.genres.slice(0, 3).map((g) => genreLabel(g.title));
  if (genres.length) parts.push(`ژانر: ${genres.join("، ")}.`);
  for (const { label, list } of people) {
    const n = names(list, 3);
    if (n.length) parts.push(`${label}: ${n.join("، ")}.`);
  }
  if (d.overview?.trim()) parts.push(d.overview);
  return excerpt(parts.join(" "), DESC_MAX);
}

export function movieMetadata(movie: MovieDetail, path: string): Metadata {
  return buildMetadata({
    title: titleWithYear(movie),
    description: mediaDescription("فیلم", movie, [
      { label: "کارگردان", list: movie.directors },
      { label: "بازیگران", list: movie.cast },
    ]),
    path,
    image: tmdb(movie.poster_path, "w780"),
    ogType: "video.movie",
  });
}

export function tvMetadata(tv: TvSeriesDetail, path: string): Metadata {
  return buildMetadata({
    title: titleWithYear(tv),
    description: mediaDescription("سریال", tv, [
      { label: "سازنده", list: tv.creators },
      { label: "بازیگران", list: tv.cast },
    ]),
    path,
    image: tmdb(tv.poster_path, "w780"),
    ogType: "video.tv_show",
  });
}

export function personMetadata(p: PersonDetail, path: string): Metadata {
  const name = p.title_fa || p.title;
  const works = new Set([...p.directed, ...p.created, ...p.acted_in].map((m) => m.id)).size;
  const roles = [p.directed.length && "کارگردان", p.created.length && "سازنده", p.acted_in.length && "بازیگر"].filter(Boolean);
  const intro = `${name}${roles.length ? ` (${roles.join("، ")})` : ""}، ${toFaDigits(works)} اثر در ${SITE_NAME}.`;
  return buildMetadata({
    title: name,
    description: excerpt(p.biography?.trim() ? `${intro} ${p.biography}` : intro, DESC_MAX),
    path,
    image: p.media?.image_url ?? null,
    ogType: "profile",
    // A page with no biography and almost no credits is thin content.
    index: !!p.biography?.trim() || works >= 3,
  });
}

export function genreMetadata(g: GenreDetail, path: string): Metadata {
  const label = genreLabel(g.title);
  const total = g.movies.length + g.tv_series.length;
  const intro = `بهترین فیلم‌ها و سریال‌های ${label} بر اساس امتیاز ${SITE_NAME}${total ? ` (${toFaDigits(total)} عنوان)` : ""}.`;
  return buildMetadata({
    title: `بهترین‌های ${label}`,
    description: excerpt(g.description?.trim() ? `${intro} ${g.description}` : intro, DESC_MAX),
    path,
    image: g.media?.image_url ?? null,
    ogType: "website",
  });
}

// --- JSON-LD ---

function crumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

function personRefs(people: { title: string; title_fa?: string | null; slug: string }[], max: number) {
  return people.slice(0, max).map((p) => ({
    "@type": "Person",
    name: p.title_fa || p.title,
    url: absoluteUrl(`/person/${p.slug}`),
  }));
}

function ratingBlock(d: { computed_score: number | null; total_votes: number }) {
  // Only ratings the site itself collected count as aggregateRating.
  if (d.computed_score == null || !(d.total_votes > 0)) return {};
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: Number(d.computed_score.toFixed(1)),
      bestRating: 10,
      worstRating: 1,
      ratingCount: d.total_votes,
    },
  };
}

export function movieJsonLd(movie: MovieDetail, path: string) {
  const url = absoluteUrl(path);
  const image = tmdb(movie.poster_path, "w780");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Movie",
        "@id": `${url}#movie`,
        url,
        name: movie.title_fa || movie.title,
        ...(movie.title_fa ? { alternateName: movie.title } : {}),
        inLanguage: "fa-IR",
        ...(image ? { image } : {}),
        ...(movie.overview ? { description: excerpt(movie.overview, 300) } : {}),
        ...(movie.year ? { datePublished: String(movie.year) } : {}),
        ...(movie.runtime ? { duration: `PT${movie.runtime}M` } : {}),
        ...(movie.genres.length ? { genre: movie.genres.map((g) => genreLabel(g.title)) } : {}),
        ...(movie.directors.length ? { director: personRefs(movie.directors, 3) } : {}),
        ...(movie.cast.length ? { actor: personRefs(movie.cast, 8) } : {}),
        ...ratingBlock(movie),
      },
      crumbs([
        { name: SITE_NAME, path: "/" },
        { name: "فیلم‌ها", path: "/rankings" },
        { name: movie.title_fa || movie.title, path },
      ]),
    ],
  };
}

export function tvJsonLd(tv: TvSeriesDetail, path: string) {
  const url = absoluteUrl(path);
  const image = tmdb(tv.poster_path, "w780");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TVSeries",
        "@id": `${url}#series`,
        url,
        name: tv.title_fa || tv.title,
        ...(tv.title_fa ? { alternateName: tv.title } : {}),
        inLanguage: "fa-IR",
        ...(image ? { image } : {}),
        ...(tv.overview ? { description: excerpt(tv.overview, 300) } : {}),
        ...(tv.first_air_date ? { startDate: tv.first_air_date } : tv.year ? { startDate: String(tv.year) } : {}),
        ...(tv.number_of_seasons ? { numberOfSeasons: tv.number_of_seasons } : {}),
        ...(tv.number_of_episodes ? { numberOfEpisodes: tv.number_of_episodes } : {}),
        ...(tv.genres.length ? { genre: tv.genres.map((g) => genreLabel(g.title)) } : {}),
        ...(tv.creators.length ? { creator: personRefs(tv.creators, 3) } : {}),
        ...(tv.cast.length ? { actor: personRefs(tv.cast, 8) } : {}),
        ...ratingBlock(tv),
      },
      crumbs([
        { name: SITE_NAME, path: "/" },
        { name: "سریال‌ها", path: "/rankings?type=tv_series" },
        { name: tv.title_fa || tv.title, path },
      ]),
    ],
  };
}

export function personJsonLd(p: PersonDetail, path: string) {
  const url = absoluteUrl(path);
  const name = p.title_fa || p.title;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": `${url}#person`,
        url,
        name,
        ...(p.title_fa ? { alternateName: p.title } : {}),
        ...(p.media?.image_url ? { image: p.media.image_url } : {}),
        ...(p.biography ? { description: excerpt(p.biography, 300) } : {}),
      },
      crumbs([
        { name: SITE_NAME, path: "/" },
        { name: "هنرمندان", path: "/people" },
        { name: name, path },
      ]),
    ],
  };
}
