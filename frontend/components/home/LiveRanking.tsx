"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { HomeTitle } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";
import { useFavorites } from "@/contexts/FavoritesContext";

type Tab = "movie" | "tv_series";

export default function LiveRanking({ movies, tvSeries }: { movies: HomeTitle[]; tvSeries: HomeTitle[] }) {
  const [tab, setTab] = useState<Tab>(movies.length > 0 ? "movie" : "tv_series");
  const { isFavorite, toggleFavorite } = useFavorites();
  const rows = tab === "movie" ? movies : tvSeries;
  const topScore = rows[0]?.score ?? null;

  if (movies.length === 0 && tvSeries.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <SectionHeading
        kicker="The universe, ranked"
        title="کهکشان، رتبه‌بندی‌شده."
        lead="ترتیب زنده بر اساس امتیاز ترکیبی RankVerse — رأی کاربران به‌همراه داده‌های بیرونی."
        action={
          tvSeries.length > 0 && movies.length > 0 ? (
            <div role="tablist" aria-label="نوع رتبه‌بندی" className="inline-flex rounded-full border border-border bg-surface/60 p-1">
              {(
                [
                  ["movie", "فیلم"],
                  ["tv_series", "سریال"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${tab === value ? "bg-gold/15 text-gold" : "text-muted hover:text-ink"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      <ol key={tab} className="divide-y divide-white/5 border-y border-white/5">
        {rows.map((t, i) => {
          const meta = [
            t.year ? toFaDigits(t.year) : null,
            t.directors[0]?.title ?? null,
            t.genres.length > 0 ? t.genres.slice(0, 2).map((g) => genreLabel(g.title)).join("، ") : null,
          ].filter(Boolean);
          const barWidth = topScore && t.score !== null ? Math.max(4, (t.score / topScore) * 100) : 0;

          return (
            <li key={t.id} className="rv-rise flex items-center" style={{ ["--rv-delay" as string]: `${i * 45}ms` }}>
              <Link
                href={detailPathFor(t.entity_type, t.slug) ?? `/movies/${t.slug}`}
                className="group relative flex min-w-0 flex-1 items-center gap-4 px-2 py-4 transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] sm:gap-6 sm:px-4"
              >
                <span className="num w-10 shrink-0 text-center text-2xl text-muted/50 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-gold sm:w-14 sm:text-4xl">
                  {toFaDigits(String(t.rank).padStart(2, "0"))}
                </span>

                <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2 ring-1 ring-white/5 transition-transform duration-300 group-hover:scale-110 group-hover:ring-gold/40 sm:h-20 sm:w-14">
                  {t.posterUrl ? (
                    <Image src={t.posterUrl} alt="" fill sizes="56px" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-brand opacity-30" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-ink sm:text-lg">{displayTitle(t)}</span>
                  {meta.length > 0 && <span className="mt-1 block truncate text-xs text-muted">{meta.join(" · ")}</span>}
                  <span className="mt-1 block text-[11px] text-muted/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="num">{toFaDigits(t.votes)}</span> رأی کاربر
                  </span>
                </span>

                <span className="hidden w-40 shrink-0 md:block" aria-hidden="true">
                  <span className="block h-px w-full bg-white/5">
                    <span
                      className="block h-px bg-gradient-to-l from-gold to-violet transition-all duration-500 group-hover:h-[2px]"
                      style={{ width: `${barWidth}%` }}
                    />
                  </span>
                </span>

                <span className="num w-14 shrink-0 text-left text-lg text-ink-dim transition-all duration-300 group-hover:scale-110 group-hover:text-gold sm:text-xl">
                  {t.score !== null ? toFaDigits(t.score.toFixed(1)) : "—"}
                </span>
              </Link>
              {/* Kept from the old home grid (FavoriteEntityCard): favoriting straight from the ranking. */}
              <button
                type="button"
                onClick={() => toggleFavorite({ id: t.id, slug: t.slug, entity_type: t.entity_type })}
                aria-label={isFavorite(t.id) ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
                aria-pressed={isFavorite(t.id)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:text-gold ${isFavorite(t.id) ? "text-gold" : "text-muted/50"}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite(t.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                </svg>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex justify-center">
        <Link
          href={tab === "tv_series" ? "/rankings?type=tv_series" : "/rankings"}
          className="btn-secondary text-sm transition hover:border-gold/40 hover:text-gold"
        >
          مشاهدهٔ رتبه‌بندی کامل
        </Link>
      </div>
    </section>
  );
}
