"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchEntities, SearchResult } from "@/lib/api";

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
        const data = await searchEntities(query, "movie");
        setResults(data);
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

  function handleSelect(slug: string) {
    setOpen(false);
    setQuery("");
    router.push(`/movies/${slug}`);
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
                onClick={() => handleSelect(r.slug)}
                className="block w-full px-3 py-2 text-right text-sm text-ink transition hover:bg-surface2"
              >
                {r.title}
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