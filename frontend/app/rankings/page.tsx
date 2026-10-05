import type { Metadata } from "next";
import Link from "next/link";
import PosterCard from "@/components/entities/poster-card";
import RankingFilters from "@/components/RankingFilters";
import { getRankingsPage, RankingsPage } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

export const revalidate = 1800;

const PAGE_SIZE = 24;

type RankingType = "movie" | "tv_series";

const SORT_OPTIONS = [
  ["score", "امتیاز RankVerse"],
  ["votes", "بیشترین رأی"],
  ["year_desc", "جدیدترین"],
  ["year_asc", "قدیمی‌ترین"],
] as const;

const ORIGIN_OPTIONS = [
  ["all", "همه"],
  ["persian", "فارسی‌زبان"],
  ["foreign", "خارجی"],
] as const;

const GENRES = [
  "action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "family",
  "fantasy", "history", "horror", "music", "mystery", "romance", "science-fiction", "thriller", "war", "western",
];

// First year of each decade; the last entry covers everything before 1950.
const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];

interface Filters {
  genre?: string;
  sort?: string;
  decade?: number;
  origin?: string;
}

function buildHref(type: RankingType, page: number, f: Filters = {}): string {
  const qs = new URLSearchParams();
  if (type === "tv_series") qs.set("type", "tv_series");
  if (f.genre) qs.set("genre", f.genre);
  if (f.decade) qs.set("decade", String(f.decade));
  if (f.origin && f.origin !== "all") qs.set("origin", f.origin);
  if (f.sort && f.sort !== "score") qs.set("sort", f.sort);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/rankings?${s}` : "/rankings";
}

type RankingsSearchParams = { type?: string; page?: string; genre?: string; sort?: string; decade?: string; origin?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<RankingsSearchParams> }): Promise<Metadata> {
  const params = await searchParams;
  const type: RankingType = params.type === "tv_series" ? "tv_series" : "movie";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const genre = GENRES.includes(params.genre ?? "") ? params.genre : undefined;
  const decadeParam = Number.parseInt(params.decade ?? "", 10);
  const decade = DECADES.includes(decadeParam) ? decadeParam : undefined;
  const plural = type === "tv_series" ? "سریال‌ها" : "فیلم‌ها";
  // Genre/decade pages are real landing pages ("بهترین فیلم‌های ترسناک دهه ۹۰").
  // Re-sorted or origin-filtered views duplicate them, so they stay out of the index.
  const duplicate = (params.sort !== undefined && params.sort !== "score") || (params.origin ?? "all") !== "all";
  const canonical = buildHref(type, page, { genre, decade });

  const parts = [`بهترین ${plural}`];
  if (genre) parts[0] = `بهترین ${plural.replace("ها", "های")} ${genreLabel(genre)}`;
  if (decade) parts.push(`دهه ${toFaDigits(decade)}`);
  const base = parts.join(" ");
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

export default async function RankingsPageRoute({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  const params = await searchParams;
  const type: RankingType = params.type === "tv_series" ? "tv_series" : "movie";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const genre = params.genre?.trim() || undefined;
  const sort = SORT_OPTIONS.some(([v]) => v === params.sort) ? params.sort! : "score";
  const decadeParam = Number.parseInt(params.decade ?? "", 10);
  const decade = DECADES.includes(decadeParam) ? decadeParam : undefined;
  const origin = ORIGIN_OPTIONS.some(([v]) => v === params.origin) ? params.origin! : "all";
  const filters: Filters = { genre, sort, decade, origin };

  let result: RankingsPage = { items: [], total: null };
  let loadError: string | null = null;
  try {
    result = await getRankingsPage(type, { page, page_size: PAGE_SIZE, genre,
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <p className="kicker text-teal/80">The universe, ranked</p>
      <h1 className="font-display mt-3 text-3xl text-ink sm:text-4xl">رتبه‌بندی کامل</h1>
      <p className="mt-2 text-sm text-muted">بر اساس امتیاز ترکیبی RankVerse — رأی کاربران به‌همراه داده‌های بیرونی.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-surface/60 p-1" role="tablist" aria-label="نوع رتبه‌بندی">
          {(
            [
              ["movie", "فیلم"],
              ["tv_series", "سریال"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={buildHref(value, 1, filters)}
              role="tab"
              aria-selected={type === value}
              className={`rounded-full px-4 py-1.5 text-sm transition ${type === value ? "bg-gold/15 text-gold" : "text-muted hover:text-ink"}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <RankingFilters
          selects={[
            {
              label: "ژانر:",
              en: "GENRE",
              value: genre ?? "",
              options: [
                ["", "همه", buildHref(type, 1, { ...filters, genre: undefined })],
                ...(genre && !GENRES.includes(genre)
                  ? [[genre, genreLabel(genre), buildHref(type, 1, filters)] as const]
                  : []),
                ...GENRES.map((g) => [g, genreLabel(g), buildHref(type, 1, { ...filters, genre: g })] as const),
              ],
            },
            {
              label: "زبان:",
              en: "LANGUAGE",
              value: origin,
              options: ORIGIN_OPTIONS.map(([v, l]) => [v, l, buildHref(type, 1, { ...filters, origin: v })] as const),
            },
            {
              label: "دهه:",
              en: "DECADE",
              value: decade ? String(decade) : "",
              options: [
                ["", "همه", buildHref(type, 1, { ...filters, decade: undefined })],
                ...DECADES.map((d) => [String(d), toFaDigits(d), buildHref(type, 1, { ...filters, decade: d })] as const),
              ],
            },
            {
              label: "نمایش بر اساس:",
              en: "SORT BY",
              value: sort,
              options: SORT_OPTIONS.map(([v, l]) => [v, l, buildHref(type, 1, { ...filters, sort: v })] as const),
            },
          ]}
        />

        {result.total !== null && (
          <span className="text-xs text-muted">
            <span className="num">{toFaDigits(result.total)}</span> عنوان
          </span>
        )}
      </div>

      <div className="mt-8">
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
      </div>

      {!loadError && (page > 1 || hasNext) && (
        <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={buildHref(type, page - 1, filters)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
              → قبلی
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted">
            صفحهٔ <span className="num">{toFaDigits(page)}</span>
            {totalPages !== null && (
              <>
                {" "}از <span className="num">{toFaDigits(totalPages)}</span>
              </>
            )}
          </span>
          {hasNext ? (
            <Link href={buildHref(type, page + 1, filters)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
              بعدی ←
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
