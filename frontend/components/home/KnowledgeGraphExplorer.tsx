"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { HomeTitle, posterUrlFor } from "@/lib/home-data";
import { getGenreBySlug, getMovieBySlug, getPersonBySlug, getTvSeriesBySlug } from "@/lib/api";
import { MovieDetail, MovieListItem, TvSeriesDetail } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";

type Kind = "movie" | "tv_series" | "person" | "genre" | "year";

interface Satellite {
  key: string;
  kind: Kind;
  slug?: string;
  label: string;
  relation: string;
  posterUrl?: string | null;
}

interface Focus {
  kind: Exclude<Kind, "year">;
  slug: string;
  label: string;
  caption: string;
  posterUrl: string | null;
  satellites: Satellite[];
}

const KIND_STYLE: Record<Kind, { dot: string; ring: string; text: string; stroke: string }> = {
  movie: { dot: "bg-gold", ring: "border-gold/50", text: "text-gold", stroke: "#E8B34A" },
  tv_series: { dot: "bg-violet-soft", ring: "border-violet-soft/50", text: "text-violet-soft", stroke: "#a78bfa" },
  person: { dot: "bg-violet", ring: "border-violet/50", text: "text-violet-soft", stroke: "#9163f5" },
  genre: { dot: "bg-teal", ring: "border-teal/50", text: "text-teal", stroke: "#4FB8A6" },
  year: { dot: "bg-muted", ring: "border-border", text: "text-muted", stroke: "#8A93A6" },
};

const MAX_SATELLITES = 8;

function titleSatellite(item: MovieListItem, relation: string): Satellite {
  const kind: Kind = item.entity_type === "tv_series" ? "tv_series" : "movie";
  return { key: `${kind}:${item.slug}`, kind, slug: item.slug, label: displayTitle(item), relation, posterUrl: posterUrlFor(item, "w185") };
}

function focusFromTitle(t: {
  kind: "movie" | "tv_series";
  slug: string;
  label: string;
  posterUrl: string | null;
  year: number | null;
  directors: { slug: string; title: string }[];
  genres: { slug: string; title: string }[];
  cast: { slug: string; title: string }[];
  creators?: { slug: string; title: string }[];
}): Focus {
  const sats: Satellite[] = [
    ...(t.creators ?? []).slice(0, 1).map((p) => ({ key: `person:${p.slug}`, kind: "person" as Kind, slug: p.slug, label: p.title, relation: "سازنده" })),
    ...t.directors.slice(0, 2).map((p) => ({ key: `person:${p.slug}`, kind: "person" as Kind, slug: p.slug, label: p.title, relation: "کارگردان" })),
    ...t.genres.slice(0, 3).map((g) => ({ key: `genre:${g.slug}`, kind: "genre" as Kind, slug: g.slug, label: genreLabel(g.title), relation: "ژانر" })),
    ...(t.year ? [{ key: `year:${t.year}`, kind: "year" as Kind, label: toFaDigits(t.year), relation: "سال" }] : []),
    ...t.cast.slice(0, 4).map((p) => ({ key: `person:${p.slug}`, kind: "person" as Kind, slug: p.slug, label: p.title, relation: "بازیگر" })),
  ];
  const unique = sats.filter((s, i) => sats.findIndex((o) => o.key === s.key) === i);
  return {
    kind: t.kind,
    slug: t.slug,
    label: t.label,
    caption: t.kind === "tv_series" ? "سریال" : "فیلم",
    posterUrl: t.posterUrl,
    satellites: unique.slice(0, MAX_SATELLITES),
  };
}

function focusFromDetail(d: MovieDetail | TvSeriesDetail, kind: "movie" | "tv_series"): Focus {
  return focusFromTitle({
    kind,
    slug: d.slug,
    label: displayTitle(d),
    posterUrl: posterUrlFor(d),
    year: d.year,
    directors: d.directors,
    genres: d.genres,
    cast: d.cast,
    creators: "creators" in d ? d.creators : undefined,
  });
}

function byScore(a: MovieListItem, b: MovieListItem) {
  return (b.computed_score ?? -1) - (a.computed_score ?? -1);
}

async function loadFocus(kind: Exclude<Kind, "year">, slug: string): Promise<Focus> {
  if (kind === "movie") return focusFromDetail(await getMovieBySlug(slug), "movie");
  if (kind === "tv_series") return focusFromDetail(await getTvSeriesBySlug(slug), "tv_series");

  if (kind === "person") {
    const p = await getPersonBySlug(slug);
    const tagged = [
      ...p.directed.map((m) => ({ m, relation: "کارگردانی" })),
      ...p.created.map((m) => ({ m, relation: "ساخته" })),
      ...p.acted_in.map((m) => ({ m, relation: "بازی" })),
    ];
    const seen = new Set<string>();
    const sats = tagged
      .sort((a, b) => byScore(a.m, b.m))
      .filter(({ m }) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .slice(0, MAX_SATELLITES)
      .map(({ m, relation }) => titleSatellite(m, relation));
    return { kind, slug, label: p.title, caption: "شخص", posterUrl: p.media.image_url, satellites: sats };
  }

  const g = await getGenreBySlug(slug);
  const sats = [...g.movies.slice().sort(byScore).slice(0, 6), ...g.tv_series.slice().sort(byScore).slice(0, 2)].map((m) =>
    titleSatellite(m, m.entity_type === "tv_series" ? "سریال" : "فیلم")
  );
  return { kind, slug, label: genreLabel(g.title), caption: "ژانر", posterUrl: null, satellites: sats };
}

export default function KnowledgeGraphExplorer({ seed }: { seed: HomeTitle }) {
  const initial = focusFromTitle({
    kind: seed.entity_type === "tv_series" ? "tv_series" : "movie",
    slug: seed.slug,
    label: displayTitle(seed),
    posterUrl: seed.posterUrl,
    year: seed.year,
    directors: seed.directors,
    genres: seed.genres,
    cast: seed.cast,
  });

  const [trail, setTrail] = useState<Focus[]>([initial]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const cache = useRef(new Map<string, Focus>([[`${initial.kind}:${initial.slug}`, initial]]));

  const focus = trail[trail.length - 1];

  // Satellites start collapsed on the centre and fly out on the next frame.
  useEffect(() => {
    setExpanded(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
    return () => cancelAnimationFrame(id);
  }, [focus]);

  async function open(sat: Satellite) {
    if (sat.kind === "year" || !sat.slug || loadingKey) return;
    const key = `${sat.kind}:${sat.slug}`;
    setError(null);
    const existingIndex = trail.findIndex((f) => `${f.kind}:${f.slug}` === key);
    if (existingIndex >= 0) {
      setTrail(trail.slice(0, existingIndex + 1));
      return;
    }
    try {
      let next = cache.current.get(key);
      if (!next) {
        setLoadingKey(key);
        next = await loadFocus(sat.kind, sat.slug);
        cache.current.set(key, next);
      }
      setTrail((t) => [...t, next!].slice(-6));
    } catch {
      setError("دریافت اتصال‌های این گره ممکن نشد. دوباره امتحان کنید.");
    } finally {
      setLoadingKey(null);
    }
  }

  const n = focus.satellites.length;
  const placed = focus.satellites.map((s, i) => {
    const angle = ((-90 + (360 / Math.max(n, 1)) * i) * Math.PI) / 180;
    // Rounded: server vs browser trig can differ in the last digits (hydration).
    return { s, x: Math.round((50 + 37 * Math.cos(angle)) * 100) / 100, y: Math.round((50 + 37 * Math.sin(angle)) * 100) / 100 };
  });
  const focusHref = detailPathFor(focus.kind, focus.slug);

  return (
    <section id="universe" className="relative scroll-mt-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading
          kicker="Everything is connected"
          title="همه‌چیز به هم وصل است."
          lead="روی هر گره بزنید تا مرکز کهکشان شود: کارگردان به فیلم‌هایش، ژانر به عنوان‌هایش، فیلم به آدم‌ها و ژانرهایش."
        />

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div className="relative mx-auto aspect-square w-full max-w-[600px]">
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
              <circle cx="50" cy="50" r="37" fill="none" stroke="#F2F0E8" strokeOpacity="0.05" strokeWidth="0.2" strokeDasharray="0.5 1.5" />
              {placed.map(({ s, x, y }, i) => (
                <line
                  key={`${focus.slug}-${s.key}`}
                  x1="50"
                  y1="50"
                  x2={x}
                  y2={y}
                  pathLength={1}
                  stroke={KIND_STYLE[s.kind].stroke}
                  strokeOpacity={loadingKey === `${s.kind}:${s.slug}` ? 0.9 : 0.35}
                  strokeWidth="0.25"
                  className="rv-draw"
                  style={{ ["--rv-delay" as string]: `${i * 60}ms` }}
                />
              ))}
            </svg>

            {/* Centre node */}
            <div className="absolute left-1/2 top-1/2 z-10 flex w-[34%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
              <div className={`relative h-20 w-20 overflow-hidden rounded-full border-2 bg-surface2 shadow-[0_0_60px_-10px_rgba(232,179,74,0.5)] sm:h-28 sm:w-28 ${KIND_STYLE[focus.kind].ring}`}>
                {focus.posterUrl ? (
                  <Image src={focus.posterUrl} alt="" fill sizes="112px" className="object-cover" />
                ) : (
                  <span className={`absolute inset-0 flex items-center justify-center font-display text-3xl ${KIND_STYLE[focus.kind].text}`}>
                    {focus.label.charAt(0)}
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-ink sm:text-sm">{focus.label}</p>
              <p className={`text-[10px] ${KIND_STYLE[focus.kind].text}`}>{focus.caption}</p>
            </div>

            {placed.map(({ s, x, y }) => {
              const style = KIND_STYLE[s.kind];
              const interactive = s.kind !== "year" && !!s.slug;
              const isLoading = loadingKey === `${s.kind}:${s.slug}`;
              const content = (
                <>
                  <span className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-surface sm:h-11 sm:w-11 ${style.ring} ${isLoading ? "animate-pulse" : ""}`}>
                    {s.posterUrl ? (
                      <Image src={s.posterUrl} alt="" fill sizes="44px" className="object-cover" />
                    ) : (
                      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                    )}
                  </span>
                  <span className="mt-1 line-clamp-2 max-w-[92px] text-[10px] leading-4 text-ink-dim sm:max-w-[120px] sm:text-xs">{s.label}</span>
                  <span className={`text-[9px] sm:text-[10px] ${style.text}`}>{s.relation}</span>
                </>
              );
              const common = "rv-motion absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center transition-all duration-700 ease-out";
              const pos = {
                left: `${expanded ? x : 50}%`,
                top: `${expanded ? y : 50}%`,
                opacity: expanded ? 1 : 0,
              };
              return interactive ? (
                <button
                  key={`${focus.slug}-${s.key}`}
                  type="button"
                  onClick={() => open(s)}
                  disabled={!!loadingKey}
                  aria-label={`${s.relation}: ${s.label}`}
                  className={`${common} group rounded-xl p-1 hover:scale-105 disabled:cursor-wait`}
                  style={pos}
                >
                  {content}
                </button>
              ) : (
                <div key={`${focus.slug}-${s.key}`} className={common} style={pos}>
                  {content}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <p className="kicker text-muted/70">Path</p>
              <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {trail.map((f, i) => (
                  <li key={`${f.kind}:${f.slug}`} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted/50" aria-hidden="true">←</span>}
                    <button
                      type="button"
                      onClick={() => setTrail(trail.slice(0, i + 1))}
                      disabled={i === trail.length - 1}
                      className={`max-w-[160px] truncate rounded-full border px-3 py-1 transition ${
                        i === trail.length - 1 ? `${KIND_STYLE[f.kind].ring} ${KIND_STYLE[f.kind].text}` : "border-border text-muted hover:text-ink"
                      }`}
                    >
                      {f.label}
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-white/5 bg-surface/40 p-5">
              <p className={`text-xs ${KIND_STYLE[focus.kind].text}`}>{focus.caption}</p>
              <p className="mt-1 text-lg font-medium text-ink">{focus.label}</p>
              <p className="mt-2 text-sm text-muted">
                <span className="num">{toFaDigits(focus.satellites.length)}</span> اتصال نمایش داده‌شده
              </p>
              {focusHref && (
                <Link href={focusHref} className="mt-4 inline-flex items-center gap-1 text-sm text-gold hover:underline">
                  رفتن به صفحهٔ {focus.caption}
                  <span aria-hidden="true">←</span>
                </Link>
              )}
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold">
                {error}
              </p>
            )}

            <ul className="flex flex-wrap gap-3 text-[11px] text-muted">
              {(
                [
                  ["movie", "فیلم"],
                  ["tv_series", "سریال"],
                  ["person", "شخص"],
                  ["genre", "ژانر"],
                  ["year", "سال"],
                ] as const
              ).map(([k, label]) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${KIND_STYLE[k].dot}`} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
