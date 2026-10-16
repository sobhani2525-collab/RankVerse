import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EntityHero from "@/components/EntityHero";
import EntityDescription from "@/components/EntityDescription";
import EntityLists from "@/components/EntityLists";
import MediaPlayer from "@/components/MediaPlayer";
import PosterCard from "@/components/entities/poster-card";
import RankingFilters from "@/components/RankingFilters";
import RankingsPager from "@/components/RankingsPager";
import JsonLd from "@/components/JsonLd";
import { getGenreBySlug, getRankingsPage, isNotFoundError, RankingsPage } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { SITE_LOCALE, SITE_NAME, absoluteUrl } from "@/lib/site";
import {
  DECADES, ORIGIN_OPTIONS, RANKING_PAGE_SIZE as PAGE_SIZE, SORT_OPTIONS, type RankingType,
  parseDecade, parseOrigin, parsePage, parseRankingType, parseSort,
} from "@/lib/ranking-options";

// Same browsing as /rankings, fixed to one genre: movie/series tabs, language,
// decade and sort filters, a numbered pager. Dynamic like /rankings (it reads
// the query string), with the same 30-minute data cache.
export const revalidate = 1800;

type SearchParams = { type?: string; page?: string; sort?: string; decade?: string; origin?: string };

const loadGenre = cache((slug: string) => getGenreBySlug(slug));

interface Filters {
  sort?: string;
  decade?: number;
  origin?: string;
}

function buildHref(slug: string, type: RankingType, page: number, f: Filters = {}): string {
  const qs = new URLSearchParams();
  if (type === "tv_series") qs.set("type", "tv_series");
  if (f.decade) qs.set("decade", String(f.decade));
  if (f.origin && f.origin !== "all") qs.set("origin", f.origin);
  if (f.sort && f.sort !== "score") qs.set("sort", f.sort);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  const base = `/genre/${encodeURIComponent(slug)}`;
  return s ? `${base}?${s}` : base;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  let genre;
  try {
    genre = await loadGenre(slug);
  } catch (err) {
    if (isNotFoundError(err)) return { title: "ژانر پیدا نشد", robots: { index: false, follow: false } };
    return {};
  }
  const type = parseRankingType(query.type);
  const page = parsePage(query.page);
  const decade = parseDecade(query.decade);
  const label = genreLabel(genre.title);
  const plural = type === "tv_series" ? "سریال‌های" : "فیلم‌های";
  // Re-sorted or origin-filtered views duplicate the plain list, so they stay out of the index.
  const duplicate = (query.sort !== undefined && query.sort !== "score") || (query.origin ?? "all") !== "all";
  const canonical = buildHref(slug, type, page, { decade });

  const base = `بهترین ${plural} ${label}${decade ? ` دهه ${toFaDigits(decade)}` : ""}`;
  const title = page > 1 ? `${base} — صفحهٔ ${toFaDigits(page)}` : base;
  const description = `رتبه‌بندی ${base} بر اساس امتیاز ترکیبی ${SITE_NAME}: رأی کاربران، امتیاز بیرونی و نتایج نبردها.`;
  return {
    title,
    description,
    alternates: { canonical },
    robots: duplicate ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: "website", url: canonical, siteName: SITE_NAME, locale: SITE_LOCALE, title, description },
  };
}

export default async function GenrePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  let genre;
  try {
    genre = await loadGenre(slug);
  } catch (err) {
    // Only a real 404 is a 404; a timeout or 5xx rethrows so the last good page can be kept.
    if (isNotFoundError(err)) notFound();
    throw err;
  }

  const type = parseRankingType(query.type);
  const page = parsePage(query.page);
  const sort = parseSort(query.sort);
  const decade = parseDecade(query.decade);
  const origin = parseOrigin(query.origin);
  const filters: Filters = { sort, decade, origin };
  const label = genreLabel(genre.title);

  let result: RankingsPage = { items: [], total: null };
  let loadError: string | null = null;
  try {
    result = await getRankingsPage(type, {
      page,
      page_size: PAGE_SIZE,
      genre: slug,
      sort,
      origin,
      year_from: decade,
      year_to: decade ? decade + 9 : undefined,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  const totalPages = result.total !== null ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : null;
  const hasNext = totalPages !== null ? page < totalPages : result.items.length === PAGE_SIZE;
  const href = (t: RankingType, p: number, f: Filters = filters) => buildHref(slug, t, p, f);

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `بهترین‌های ${label}`,
          url: absoluteUrl(buildHref(slug, type, page, { decade })),
          inLanguage: "fa-IR",
        }}
      />
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <EntityHero
        title={`بهترین‌های ${label}`}
        subtitle={result.total !== null ? `${toFaDigits(result.total)} عنوان` : undefined}
        media={genre.media}
      />
      <MediaPlayer media={genre.media} />
      <EntityDescription text={genre.description} />

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-surface/60 p-1" role="tablist" aria-label="نوع رتبه‌بندی">
          {(
            [
              ["movie", "فیلم"],
              ["tv_series", "سریال"],
            ] as const
          ).map(([value, text]) => (
            <Link
              key={value}
              href={href(value, 1)}
              role="tab"
              aria-selected={type === value}
              className={`rounded-full px-4 py-1.5 text-sm transition ${type === value ? "bg-gold/15 text-gold" : "text-muted hover:text-ink"}`}
            >
              {text}
            </Link>
          ))}
        </div>

        <RankingFilters
          selects={[
            {
              label: "زبان:",
              en: "LANGUAGE",
              value: origin,
              options: ORIGIN_OPTIONS.map(([v, l]) => [v, l, href(type, 1, { ...filters, origin: v })] as const),
            },
            {
              label: "دهه:",
              en: "DECADE",
              value: decade ? String(decade) : "",
              options: [
                ["", "همه", href(type, 1, { ...filters, decade: undefined })],
                ...DECADES.map((d) => [String(d), toFaDigits(d), href(type, 1, { ...filters, decade: d })] as const),
              ],
            },
            {
              label: "نمایش بر اساس:",
              en: "SORT BY",
              value: sort,
              options: SORT_OPTIONS.map(([v, l]) => [v, l, href(type, 1, { ...filters, sort: v })] as const),
            },
          ]}
        />
      </div>

      <section className="mt-8">
        {loadError ? (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
            اتصال به RankVerse Core Engine برقرار نشد.
            <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
          </div>
        ) : result.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
            عنوانی با این فیلترها پیدا نشد.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {result.items.map((item) => (
              <PosterCard key={item.id} entity={item} fluid />
            ))}
          </div>
        )}
      </section>

      {!loadError && <RankingsPager page={page} totalPages={totalPages} hasNext={hasNext} hrefFor={(p) => href(type, p)} />}

      <EntityLists entityId={genre.id} />
    </main>
  );
}
