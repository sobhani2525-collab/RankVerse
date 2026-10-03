import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getMovieBySlug } from "@/lib/api";
import { RESULT_KINDS, reasonOf, topicOf, type BattleThemeKind } from "@/lib/battle-theme";
import { posterUrlFor } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

const SLUG_RE = /^[a-z0-9؀-ۿ_-]{1,160}$/i;
const MAX_VALUE = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function intParam(v: string | undefined, min: number, max: number, fallback: number): number {
  if (!v || !/^\d{1,4}$/.test(v)) return fallback;
  return Math.min(max, Math.max(min, parseInt(v, 10)));
}

/** Strips control characters / markup-ish noise from the free-text theme value. */
function cleanValue(v: string | undefined): string {
  return (v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_VALUE);
}

function parse(sp: Record<string, string | string[] | undefined>) {
  const slug = first(sp.c) ?? "";
  const kindRaw = first(sp.k);
  const kind: BattleThemeKind = (RESULT_KINDS as readonly string[]).includes(kindRaw ?? "") ? (kindRaw as BattleThemeKind) : "pair";
  const value = kind === "pair" ? "" : cleanValue(first(sp.v));
  // A decade must be a plain year like 1990; anything else isn't a usable theme.
  const valid = kind === "decade" ? /^\d{4}$/.test(value) : value.length > 0;
  return {
    slug: SLUG_RE.test(slug) ? slug : null,
    streak: intParam(first(sp.w), 0, 100, 0),
    count: intParam(first(sp.n), 0, 100, 0),
    theme: { kind: valid ? kind : ("pair" as const), value: valid ? value : "" },
  };
}

const loadMovie = cache((slug: string) => getMovieBySlug(slug));

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { slug, streak, theme } = parse(await searchParams);
  if (!slug) return { title: "نتیجهٔ نبرد پیدا نشد", robots: { index: false, follow: false } };
  let movie;
  try {
    movie = await loadMovie(slug);
  } catch {
    return { title: "نتیجهٔ نبرد پیدا نشد", robots: { index: false, follow: false } };
  }
  const topic = topicOf(theme);
  const name = displayTitle(movie);
  const title = topic ? `قهرمان من در ${topic}: ${name}` : `قهرمان نبرد من: ${name}`;
  const description = `${toFaDigits(streak)} برد پیاپی. تو چه کسی را انتخاب می‌کنی؟`;
  const image = posterUrlFor(movie, "w780");
  return {
    title,
    description,
    alternates: { canonical: "/battles/result" },
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BattleResultPage({ searchParams }: { searchParams: SearchParams }) {
  const { slug, streak, theme } = parse(await searchParams);
  if (!slug) notFound();
  let movie;
  try {
    movie = await loadMovie(slug);
  } catch {
    notFound();
  }

  const poster = posterUrlFor(movie, "w780");
  const battleHref =
    theme.kind === "pair"
      ? "/battles"
      : `/battles?${new URLSearchParams({ theme_kind: theme.kind, theme_value: theme.value }).toString()}`;
  const detailHref = `/${movie.entity_type === "tv_series" ? "tv-series" : "movies"}/${movie.slug}`;

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <p className="font-display text-3xl text-gold">قهرمان من</p>

      <Link
        href={detailHref}
        aria-label={`صفحهٔ ${displayTitle(movie)}`}
        className="relative mt-8 block aspect-[2/3] w-64 overflow-hidden rounded-2xl border-[1.5px] border-gold bg-surface2 shadow-[0_0_0_6px_rgba(232,179,74,0.18)] transition hover:shadow-[0_0_0_6px_rgba(232,179,74,0.35)]"
      >
        {poster ? (
          <Image src={poster} alt={displayTitle(movie)} fill priority sizes="256px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm text-muted">بدون پوستر</span>
        )}
      </Link>

      <h1 className="mt-8 text-2xl font-extrabold text-ink">
        <Link href={detailHref} className="transition hover:text-gold">
          {movie.title_fa || movie.title}
        </Link>
      </h1>
      {movie.title_fa && (
        <p dir="ltr" className="mt-1 text-sm text-muted">
          {movie.title}
        </p>
      )}
      <p className="mt-4 flex items-center gap-2 text-[13px] text-violet-light">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-light" aria-hidden="true" />
        {reasonOf({ ...theme, personalized: false })}
      </p>
      {streak > 0 && (
        <p className="mt-3 text-lg font-bold text-gold">
          <span className="num">{toFaDigits(streak)}</span> برد پیاپی
        </p>
      )}

      <Link href={battleHref} className="btn-primary mt-10 text-base hover:opacity-90">
        تو هم نبرد کن
      </Link>
    </main>
  );
}
