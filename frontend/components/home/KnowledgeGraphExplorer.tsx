"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { useAuth } from "@/lib/auth-context";
import { HomeTitle, posterUrlFor } from "@/lib/home-data";
import { getGenreBySlug, getMovieBySlug, getPersonBySlug, getTvSeriesBySlug, getWatchLaterItems } from "@/lib/api";
import { MovieDetail, MovieListItem, TvSeriesDetail } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";
import HeroGraphSearch from "./HeroGraphSearch";
import {
  GRAPH_CANVAS_ID,
  GRAPH_FOCUS_EVENT,
  GRAPH_FOCUS_KINDS,
  GRAPH_SEARCH_ID,
  GRAPH_SECTION_ID,
  GraphFocusKind,
  GraphFocusRequest,
  getHeroCenter,
  scrollToGraph,
} from "@/lib/graph-focus";

type Kind = "movie" | "tv_series" | "person" | "genre" | "year";

interface Satellite {
  key: string;
  kind: Kind;
  slug?: string;
  label: string;
  relation: string;
  posterUrl?: string | null;
  // Nodes without their own graph page (a year) link out instead.
  href?: string;
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

const MAX_SATELLITES = 12; // loaded per focus
const DEFAULT_SATELLITES = 8; // shown until "نمایش بیشتر"
const DECADES_WITH_RANKINGS = new Set([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]);

function yearHref(year: number, kind: "movie" | "tv_series"): string | undefined {
  const decade = Math.floor(year / 10) * 10;
  if (!DECADES_WITH_RANKINGS.has(decade)) return undefined;
  return `/rankings?${kind === "tv_series" ? "type=tv_series&" : ""}decade=${decade}`;
}

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
  directors: { slug: string; title: string; title_fa?: string | null }[];
  genres: { slug: string; title: string }[];
  cast: { slug: string; title: string; title_fa?: string | null }[];
  creators?: { slug: string; title: string; title_fa?: string | null }[];
}): Focus {
  const sats: Satellite[] = [
    ...(t.creators ?? []).slice(0, 1).map((p) => ({ key: `person:${p.slug}`, kind: "person" as Kind, slug: p.slug, label: p.title_fa ?? p.title, relation: "سازنده" })),
    ...t.directors.slice(0, 2).map((p) => ({ key: `person:${p.slug}`, kind: "person" as Kind, slug: p.slug, label: p.title_fa ?? p.title, relation: "کارگردان" })),
    ...t.genres.slice(0, 4).map((g) => ({ key: `genre:${g.slug}`, kind: "genre" as Kind, slug: g.slug, label: genreLabel(g.title), relation: "ژانر" })),
    ...(t.year ? [{ key: `year:${t.year}`, kind: "year" as Kind, label: toFaDigits(t.year), relation: "سال", href: yearHref(t.year, t.kind) }] : []),
    ...t.cast.slice(0, 6).map((p) => ({ key: `person:${p.slug}`, kind: "person" as Kind, slug: p.slug, label: p.title_fa ?? p.title, relation: "بازیگر" })),
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
    return { kind, slug, label: p.title_fa ?? p.title, caption: "هنرمند", posterUrl: p.media.image_url, satellites: sats };
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
  const [showMore, setShowMore] = useState(false);
  const [personalBusy, setPersonalBusy] = useState(false);
  const { isAuthenticated, getToken } = useAuth();
  const inflight = useRef(new Set<string>());
  const cache = useRef(new Map<string, Focus>([[`${initial.kind}:${initial.slug}`, initial]]));

  const focus = trail[trail.length - 1];

  // Satellites start collapsed on the centre and fly out on the next frame.
  useEffect(() => {
    setExpanded(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setExpanded(true)));
    return () => cancelAnimationFrame(id);
  }, [focus]);

  // Bumped on every focus request so a slow earlier fetch can't land on
  // top of a newer one (e.g. a hero search made while a node is loading).
  const requestId = useRef(0);

  const focusOn = useCallback(async (kind: Exclude<Kind, "year">, slug: string, reset = false) => {
    const key = `${kind}:${slug}`;
    const id = ++requestId.current;
    setError(null);
    let next = cache.current.get(key);
    if (!next) {
      setLoadingKey(key);
      try {
        next = await loadFocus(kind, slug);
        cache.current.set(key, next);
      } catch {
        if (id === requestId.current) {
          setError("دریافت اتصال‌های این گره ممکن نشد. دوباره امتحان کنید.");
          setLoadingKey(null);
        }
        return;
      }
    }
    if (id !== requestId.current) return;
    setLoadingKey(null);
    const found = next;
    // Already on the path -> step back to it; otherwise extend the path.
    if (reset) {
      setTrail([found]);
      return;
    }
    setTrail((t) => {
      const i = t.findIndex((f) => `${f.kind}:${f.slug}` === key);
      return i >= 0 ? t.slice(0, i + 1) : [...t, found].slice(-6);
    });
  }, []);

  // The focused entity lives in the URL (?focus=kind:slug) so a view can be
  // shared and Back steps through it. Applied on load and on popstate; pushed
  // whenever the focus changes to something the URL doesn't already say.
  const pendingUrlFocus = useRef<string | null>(null);
  // Focus set by the hero's random centre: shown, but not worth a URL/history entry.
  const silentFocus = useRef<string | null>(null);
  const seedKey = `${initial.kind}:${initial.slug}`;
  const focusKey = `${focus.kind}:${focus.slug}`;

  useEffect(() => {
    function fromUrl() {
      const raw = new URLSearchParams(window.location.search).get("focus");
      const i = raw ? raw.indexOf(":") : -1;
      const kind = raw && i > 0 ? raw.slice(0, i) : "";
      const slug = raw && i > 0 ? raw.slice(i + 1) : "";
      if (GRAPH_FOCUS_KINDS.has(kind) && slug) return { kind: kind as GraphFocusKind, slug };
      return null;
    }
    const target = fromUrl();
    if (target) {
      pendingUrlFocus.current = `${target.kind}:${target.slug}`;
      focusOn(target.kind, target.slug, true);
      if (!window.location.hash) window.setTimeout(() => scrollToGraph(), 300);
    }
    function onPop() {
      const t = fromUrl();
      if (t) focusOn(t.kind, t.slug, true);
      else {
        const home = getHeroCenter() ?? { kind: seedKey.split(":")[0] as GraphFocusKind, slug: seedKey.slice(seedKey.indexOf(":") + 1) };
        silentFocus.current = `${home.kind}:${home.slug}`;
        focusOn(home.kind, home.slug, true);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // seedKey is stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOn]);

  useEffect(() => {
    // A focus from the URL is still loading: don't overwrite it with the seed.
    if (pendingUrlFocus.current) {
      if (pendingUrlFocus.current !== focusKey) return;
      pendingUrlFocus.current = null;
    }
    if (silentFocus.current === focusKey) return;
    silentFocus.current = null;
    const current = new URLSearchParams(window.location.search).get("focus");
    if (current === focusKey || (!current && focusKey === seedKey)) return;
    const [kind, ...rest] = focusKey.split(":");
    const url = `${window.location.pathname}?focus=${kind}:${encodeURIComponent(rest.join(":"))}#${GRAPH_SECTION_ID}`;
    window.history.pushState(null, "", url);
  }, [focusKey, seedKey]);

  // Hovering a node warms the cache so the click lands instantly.
  function prefetch(sat: Satellite) {
    if (sat.kind === "year" || !sat.slug) return;
    const key = `${sat.kind}:${sat.slug}`;
    if (cache.current.has(key) || inflight.current.has(key)) return;
    inflight.current.add(key);
    loadFocus(sat.kind, sat.slug)
      .then((f) => cache.current.set(key, f))
      .catch(() => {})
      .finally(() => inflight.current.delete(key));
  }

  // Start from something the signed-in visitor saved (watch-later list).
  async function startFromMyTaste() {
    const token = getToken();
    if (!token || personalBusy) return;
    setPersonalBusy(true);
    setError(null);
    try {
      const items = (await getWatchLaterItems(token)).filter((i) => GRAPH_FOCUS_KINDS.has(i.entity_type));
      if (items.length === 0) {
        setError("هنوز چیزی در «بعداً می‌بینم» نداری. چند عنوان اضافه کن تا گراف از سلیقهٔ تو شروع شود.");
      } else {
        const pick = items[Math.floor(Math.random() * items.length)];
        await focusOn(pick.entity_type as GraphFocusKind, pick.slug, true);
      }
    } catch {
      setError("دریافت فهرست تو ممکن نشد. دوباره امتحان کنید.");
    } finally {
      setPersonalBusy(false);
    }
  }

  function open(sat: Satellite) {
    if (sat.kind === "year" || !sat.slug || loadingKey) return;
    focusOn(sat.kind, sat.slug);
  }

  // Requests from elsewhere on the page (the hero search box).
  useEffect(() => {
    function onRequest(e: Event) {
      const { kind, slug, reset } = (e as CustomEvent<GraphFocusRequest>).detail;
      if (reset) silentFocus.current = `${kind}:${slug}`;
      focusOn(kind, slug, reset);
    }
    window.addEventListener(GRAPH_FOCUS_EVENT, onRequest);
    return () => window.removeEventListener(GRAPH_FOCUS_EVENT, onRequest);
  }, [focusOn]);

  // Landing on #universe (fresh load, header link, or the same URL re-entered
  // on an open page): the browser scrolls before images and lazy blocks above
  // have settled, so it ends up short. Keep re-aligning while the layout
  // settles, and stop as soon as the visitor scrolls on their own.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    function run() {
      cleanup?.();
      if (window.location.hash !== `#${GRAPH_SECTION_ID}`) return;
      const align = () => document.getElementById(GRAPH_SECTION_ID)?.scrollIntoView({ behavior: "auto", block: "start" });
      const ro = new ResizeObserver(align);
      ro.observe(document.body);
      const timers = [0, 300, 800, 1600].map((ms) => window.setTimeout(align, ms));
      timers.push(window.setTimeout(() => ro.disconnect(), 6000));
      const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;
      const stop = () => {
        timers.forEach(window.clearTimeout);
        ro.disconnect();
      };
      events.forEach((ev) => window.addEventListener(ev, stop, { passive: true, once: true }));
      window.addEventListener("load", align, { once: true });
      cleanup = () => {
        stop();
        events.forEach((ev) => window.removeEventListener(ev, stop));
        window.removeEventListener("load", align);
      };
    }
    // Same-hash navigation fires no hashchange, so also watch anchor clicks.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a && a.getAttribute("href")?.endsWith(`#${GRAPH_SECTION_ID}`)) window.setTimeout(run, 0);
    };
    run();
    window.addEventListener("hashchange", run);
    window.addEventListener("popstate", run);
    document.addEventListener("click", onClick);
    return () => {
      cleanup?.();
      window.removeEventListener("hashchange", run);
      window.removeEventListener("popstate", run);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const visible = showMore ? focus.satellites : focus.satellites.slice(0, DEFAULT_SATELLITES);
  const n = visible.length;
  const placed = visible.map((s, i) => {
    const angle = ((-90 + (360 / Math.max(n, 1)) * i) * Math.PI) / 180;
    // Rounded: server vs browser trig can differ in the last digits (hydration).
    return { s, x: Math.round((50 + 37 * Math.cos(angle)) * 100) / 100, y: Math.round((50 + 37 * Math.sin(angle)) * 100) / 100 };
  });
  const focusHref = detailPathFor(focus.kind, focus.slug);

  return (
    <section id={GRAPH_SECTION_ID} className="relative overflow-hidden [scroll-margin-top:-3rem]">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading
          kicker="Everything is connected"
          title="همه‌چیز به هم وصل است."
          lead="روی هر گره بزنید تا مرکز کهکشان شود: کارگردان به فیلم‌هایش، ژانر به عنوان‌هایش، فیلم به هنرمندانش و ژانرهایش."
        />

        <HeroGraphSearch id={GRAPH_SEARCH_ID} inGraph className="-mt-6 mb-10 max-w-xl" placeholder="اسم فیلم، سریال یا هنرمند محبوبت را تایپ کن و در گراف کاوش کن..." />

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
          <div id={GRAPH_CANVAS_ID} className="relative mx-auto aspect-square w-full max-w-[600px]">
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

            {loadingKey && (
              <div role="status" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-full bg-[#070A12]/60 backdrop-blur-[2px]">
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden="true" />
                <span className="text-sm text-ink">در حال دریافت اتصال‌ها…</span>
              </div>
            )}

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
              const linkOut = !interactive && !!s.href;
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
                  onMouseEnter={() => prefetch(s)}
                  onFocus={() => prefetch(s)}
                  disabled={!!loadingKey}
                  aria-label={`${s.relation}: ${s.label}`}
                  className={`${common} group rounded-xl p-1 hover:scale-105 disabled:cursor-wait`}
                  style={pos}
                >
                  {content}
                </button>
              ) : linkOut ? (
                <Link
                  key={`${focus.slug}-${s.key}`}
                  href={s.href!}
                  aria-label={`${s.relation}: ${s.label}`}
                  className={`${common} rounded-xl p-1 hover:scale-105`}
                  style={pos}
                >
                  {content}
                </Link>
              ) : (
                <div key={`${focus.slug}-${s.key}`} className={common} style={pos}>
                  {content}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              {isAuthenticated && (
                <button type="button" onClick={startFromMyTaste} disabled={personalBusy || !!loadingKey} className="rounded-full border border-violet-soft/40 px-4 py-1.5 text-xs text-violet-soft transition hover:bg-violet/10 disabled:opacity-50">
                  شروع از سلیقهٔ من
                </button>
              )}
              {focus.satellites.length > DEFAULT_SATELLITES && (
                <button type="button" onClick={() => setShowMore((v) => !v)} className="rounded-full border border-border px-4 py-1.5 text-xs text-muted transition hover:text-ink">
                  {showMore ? "نمایش کمتر" : "نمایش بیشتر"}
                </button>
              )}
            </div>

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

            <CardShell href={focusHref} className="flex gap-4 rounded-2xl border border-white/5 bg-surface/40 p-5 transition hover:border-gold/40">
              {focus.kind !== "genre" && (
                <div className="relative h-[150px] w-[100px] shrink-0 overflow-hidden rounded-lg bg-surface2">
                  {focus.posterUrl ? (
                    <Image src={focus.posterUrl} alt="" fill sizes="100px" className="object-cover" />
                  ) : (
                    <span className={`absolute inset-0 flex items-center justify-center font-display text-4xl ${KIND_STYLE[focus.kind].text}`}>
                      {focus.label.charAt(0)}
                    </span>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
              <p className={`text-xs ${KIND_STYLE[focus.kind].text}`}>{focus.caption}</p>
              <p className="mt-1 text-lg font-medium text-ink">{focus.label}</p>
              {focusHref && (
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-gold">
                  رفتن به صفحهٔ {focus.caption}
                  <span aria-hidden="true">←</span>
                </span>
              )}
              </div>
            </CardShell>

            {loadingKey && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 animate-ping rounded-full bg-gold" aria-hidden="true" />
                در حال دریافت اتصال‌ها…
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold">
                {error}
              </p>
            )}

            <ul className="flex flex-wrap gap-2 text-[11px] text-muted">
              {(
                [
                  ["movie", "فیلم"],
                  ["tv_series", "سریال"],
                  ["person", "هنرمند"],
                  ["genre", "ژانر"],
                  ["year", "سال"],
                ] as const
              ).map(([k, label]) => (
                <li key={k} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
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

// The whole focus card is one link to the entity's page (a plain box when
// the type has no page).
function CardShell({ href, className, children }: { href: string | null; className: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}
