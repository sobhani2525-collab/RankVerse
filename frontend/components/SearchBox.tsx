"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchEntities, SearchResult } from "@/lib/api";

// entity_type -> route + Persian label, for every type this app can
// actually navigate to (movie/tv_series have their own route; the rest go
// through the polymorphic [type]/[slug] page via ENTITY_TYPE_REGISTRY).
// A search result whose type isn't in here (e.g. album, production_company)
// has nowhere to link to, so it's filtered out rather than shown as a dead end.
const ROUTE_BY_TYPE: Record<string, string> = {
  movie: "/movies",
  tv_series: "/tv-series",
  person: "/person",
  genre: "/genre",
  track: "/track",
};

const TYPE_LABELS: Record<string, string> = {
  movie: "فیلم",
  tv_series: "سریال",
  person: "فرد",
  genre: "ژانر",
  track: "آهنگ",
};

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // No type -> global search across every entity_type (see lib/api.ts).
        const data = await searchEntities(query);
        setResults(data.filter((r) => r.type in ROUTE_BY_TYPE));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

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
    router.push(`${basePath}/${result.slug}`);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder="جستجو در RankVerse..."
        className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-gold/50 focus:outline-none"
      />

      {open && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted">در حال جستجو...</div>
          ) : results.length > 0 ? (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => handleSelect(r)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm text-ink transition hover:bg-surface2"
              >
                <span className="truncate">{r.title}</span>
                <span className="num shrink-0 rounded-full border border-border bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">
                  {TYPE_LABELS[r.type] ?? r.type}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted">نتیجه‌ای یافت نشد</div>
          )}
        </div>
      )}
    </div>
  );
}
