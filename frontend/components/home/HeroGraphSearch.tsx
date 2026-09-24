"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { searchEntities, SearchResult } from "@/lib/api";
import { displayTitle } from "@/lib/title";
import { entityTypeLabel } from "@/lib/constants";
import { genreLabel } from "@/lib/genre-labels";
import { detailPathFor } from "@/lib/entity-routes";
import { GRAPH_FOCUS_KINDS, GRAPH_SECTION_ID, GraphFocusKind, requestGraphFocus } from "@/lib/graph-focus";

const MAX_RESULTS = 6;

// Same guard as HomeSearch: next/image only allows TMDb.
function isTmdb(url: string | null): url is string {
  return !!url && url.startsWith("https://image.tmdb.org/");
}

function resultLabel(r: SearchResult): string {
  return r.type === "genre" ? genreLabel(r.title) : displayTitle(r);
}

/**
 * Hero search: picking a result scrolls to the knowledge-graph section
 * ("همه‌چیز به هم وصل است") and re-centres the graph on that entity.
 * Only the types the graph can expand are offered. If the graph section
 * isn't on the page (it's hidden when the #1 title's details failed to
 * load), the result's own detail page is opened instead.
 */
export default function HeroGraphSearch() {
  const router = useRouter();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await searchEntities(query);
        if (cancelled) return;
        setResults(data.filter((r) => GRAPH_FOCUS_KINDS.has(r.type)).slice(0, MAX_RESULTS));
        setFailed(false);
      } catch {
        if (cancelled) return;
        setResults([]);
        setFailed(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setOpen(true);
          setActive(-1);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function select(r: SearchResult) {
    setOpen(false);
    setQuery("");
    const section = document.getElementById(GRAPH_SECTION_ID);
    if (!section) {
      const href = detailPathFor(r.type, r.slug);
      if (href) router.push(href);
      return;
    }
    requestGraphFocus({ kind: r.type as GraphFocusKind, slug: r.slug });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[active >= 0 ? active : 0]);
    }
  }

  const showList = open && query.trim().length > 0 && !loading;

  return (
    <div ref={containerRef} className="relative mt-8 max-w-md">
      <label htmlFor={`${listboxId}-input`} className="sr-only">
        جست‌وجو روی گراف
      </label>
      <div className="relative">
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute right-4 top-1/2 z-10 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id={`${listboxId}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listboxId}-opt-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="یک فیلم، سریال، آدم یا ژانر را روی گراف پیدا کن…"
          autoComplete="off"
          className="w-full rounded-2xl border border-white/10 bg-[#05070D]/80 py-3.5 pl-10 pr-11 text-sm text-ink backdrop-blur placeholder:text-muted/60 focus:border-gold/50 focus:outline-none"
        />
        {loading && <span className="absolute left-4 top-1/2 h-2 w-2 -translate-y-1/2 animate-ping rounded-full bg-gold" aria-hidden="true" />}
      </div>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="نتایج جست‌وجو"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0A0F18]/95 py-1 shadow-2xl shadow-black/60 backdrop-blur-md"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-xs text-muted">{failed ? "جست‌وجو ممکن نشد. دوباره تلاش کنید." : "چیزی پیدا نشد."}</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                aria-label={`${resultLabel(r)} — ${entityTypeLabel(r.type)}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => select(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition ${i === active ? "bg-white/[0.06]" : ""}`}
              >
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-surface2">
                  {isTmdb(r.image_url) ? (
                    <Image src={r.image_url} alt="" fill sizes="40px" className="object-cover" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{resultLabel(r)}</span>
                <span className="shrink-0 rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] text-muted">{entityTypeLabel(r.type)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
