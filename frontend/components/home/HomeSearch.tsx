"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { searchEntities, SearchResult } from "@/lib/api";
import { displayTitle } from "@/lib/title";
import { detailPathFor } from "@/lib/entity-routes";

// Group order + labels for the types GET /search can return and this app
// can route to (see lib/entity-routes.ts); anything else is left out.
const GROUPS: { type: string; label: string; kicker: string; tone: string }[] = [
  { type: "movie", label: "فیلم‌ها", kicker: "Movies", tone: "border-gold/40 text-gold" },
  { type: "tv_series", label: "سریال‌ها", kicker: "Series", tone: "border-violet-soft/40 text-violet-soft" },
  { type: "person", label: "آدم‌ها", kicker: "People", tone: "border-violet/40 text-violet-soft" },
  { type: "genre", label: "ژانرها", kicker: "Genres", tone: "border-teal/40 text-teal" },
  { type: "track", label: "موسیقی", kicker: "Tracks", tone: "border-teal/40 text-teal" },
];

// next.config only whitelists TMDb for next/image -- anything else (e.g.
// iTunes artwork on tracks) renders without a thumbnail instead of throwing.
function isTmdb(url: string | null): url is string {
  return !!url && url.startsWith("https://image.tmdb.org/");
}

export default function HomeSearch({ suggestions }: { suggestions: string[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await searchEntities(query);
        if (!cancelled) {
          setResults(data);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const grouped = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, items: (results ?? []).filter((r) => r.type === g.type && detailPathFor(r.type, r.slug)) })).filter(
        (g) => g.items.length > 0
      ),
    [results]
  );

  return (
    <section className="relative border-y border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-4xl px-6 py-24">
        <SectionHeading center kicker="Find your universe" title="کهکشانت را پیدا کن." />

        <div className="relative">
          <label htmlFor="home-search" className="sr-only">
            جست‌وجو
          </label>
          <input
            id="home-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="یک فیلم، سریال، آدم یا ژانر…"
            autoComplete="off"
            className="w-full rounded-2xl border border-white/10 bg-[#05070D] px-6 py-5 text-lg text-ink placeholder:text-muted/60 focus:border-gold/50 focus:outline-none"
          />
          {loading && <span className="absolute left-6 top-1/2 h-2 w-2 -translate-y-1/2 animate-ping rounded-full bg-gold" aria-hidden="true" />}
        </div>

        {suggestions.length > 0 && !query && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQuery(s)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted transition hover:border-gold/40 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div aria-live="polite" className="mt-8">
          {query.trim() && !loading && results !== null && grouped.length === 0 && (
            <p className="text-center text-sm text-muted">{failed ? "جست‌وجو ممکن نشد. دوباره تلاش کنید." : "چیزی پیدا نشد."}</p>
          )}

          <div className="grid gap-8 sm:grid-cols-2">
            {grouped.map((g) => (
              <div key={g.type} className="rv-rise">
                <p className="flex items-baseline gap-2">
                  <span className="text-sm text-ink">{g.label}</span>
                  <span className="kicker text-muted/60">{g.kicker}</span>
                </p>
                <ul className="mt-3 space-y-2">
                  {g.items.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={detailPathFor(r.type, r.slug)!}
                        className="group flex items-center gap-3 rounded-xl border border-white/5 bg-surface/40 p-2 transition hover:border-white/15 hover:bg-surface2/60"
                      >
                        <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-surface2 ${g.tone}`}>
                          {isTmdb(r.image_url) ? (
                            <Image src={r.image_url} alt="" fill sizes="48px" className="object-cover" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-current" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{displayTitle(r)}</span>
                        <span className="text-muted/40 transition group-hover:text-gold" aria-hidden="true">
                          ←
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
