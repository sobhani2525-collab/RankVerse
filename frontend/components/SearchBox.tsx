"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { searchEntities, SearchResult } from "@/lib/api";
import { trackAnalytics } from "@/lib/ga4";
import { entityTypeLabel } from "@/lib/constants";
import { splitTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

// entity_type -> route, for every type this app can actually navigate to
// (movie/tv_series have their own route; the rest go through the
// polymorphic [type]/[slug] page via ENTITY_TYPE_REGISTRY). A search result
// whose type isn't in here (e.g. album, production_company) has nowhere to
// link to, so it's filtered out rather than shown as a dead end.
const ROUTE_BY_TYPE: Record<string, string> = {
  movie: "/movies",
  tv_series: "/tv-series",
  person: "/person",
  genre: "/genre",
  track: "/track",
};

export default function SearchBox({ className = "min-w-0 flex-1", scope }: { className?: string; scope?: "screen" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await searchEntities(query.trim(), undefined, { scope, signal: controller.signal });
        if (controller.signal.aborted) return;
        setResults(data.filter((r) => r.type in ROUTE_BY_TYPE));
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, scope]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    const basePath = ROUTE_BY_TYPE[result.type];
    if (scope === "screen") trackAnalytics("movie_finder_start", { surface: "search" });
    router.push(`${basePath}/${result.slug}`);
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          containerRef.current?.querySelector("input")?.focus();
          setOpen(false);
        }
      }}
    >
      <input
        type="search"
        // Form-autofill extensions inject attributes (fdprocessedid) before hydration.
        suppressHydrationWarning
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setResults([]);
          setFailed(false);
          setLoading(Boolean(next.trim()));
          setOpen(Boolean(next.trim()));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && open && !loading && results[0] && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSelect(results[0]);
          }
          if (e.key === "ArrowDown" && open && results.length > 0) {
            e.preventDefault();
            containerRef.current?.querySelector("button")?.focus();
          }
        }}
        onFocus={() => query.trim() && setOpen(true)}
        aria-label={scope ? "جست‌وجوی فیلم و سریال" : "جست‌وجو در سینماگزین"}
        placeholder={scope ? "نام فارسی یا انگلیسی فیلم و سریال" : "جست‌وجو در سینماگزین"}
        maxLength={150}
        autoComplete="off"
        className={`w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-ink placeholder:text-muted focus:border-gold focus:outline-none ${scope ? "min-h-12 text-base" : "text-sm"}`}
      />

      {open && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {loading ? (
            <div role="status" className="px-3 py-3 text-sm text-muted">در حال جست‌وجو…</div>
          ) : failed ? (
            <div role="status" className="px-3 py-3 text-sm text-muted">جست‌وجو انجام نشد. دوباره امتحان کن.</div>
          ) : results.length > 0 ? (
            results.map((r) => {
              const { primary, secondary } = splitTitle(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm text-ink transition hover:bg-surface2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-surface2">
                      {r.image_url ? (
                        <Image src={r.image_url} alt="" fill sizes="32px" className="object-cover" />
                      ) : (
                        <span className="absolute inset-0 bg-gradient-brand" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-2" dir="auto">{primary}</span>
                      {secondary && (
                        <span className="block truncate text-xs text-muted" dir="auto">{secondary}</span>
                      )}
                    </span>
                  </span>
                  <span className="num shrink-0 rounded-full border border-border bg-surface2 px-1.5 py-0.5 text-xs text-muted">
                    {entityTypeLabel(r.type)}{r.year ? ` · ${toFaDigits(r.year)}` : ""}
                  </span>
                </button>
              );
            })
          ) : (
            <div role="status" className="px-3 py-3 text-sm text-muted">نتیجه‌ای پیدا نشد. بخشی از نام فارسی یا انگلیسی را امتحان کن.</div>
          )}
        </div>
      )}
    </div>
  );
}
