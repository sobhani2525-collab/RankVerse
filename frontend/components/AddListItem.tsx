"use client";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { searchEntities, addListItem, SearchResult } from "@/lib/api";

export default function AddListItem({
  slug,
  entityType,
  onAdded,
}: {
  slug: string;
  entityType: string | null;
  onAdded: () => void;
}) {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const items = await searchEntities(query, entityType || "movie");
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, entityType]);

  async function handleAdd(entityId: string) {
    if (!token) return;
    setAdding(entityId);
    setError(null);
    try {
      await addListItem(token, slug, { entity_id: entityId });
      setQuery("");
      setResults([]);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در افزودن آیتم");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface/60 p-4">
      <label className="mb-2 block text-sm text-muted">افزودن آیتم به لیست</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="نام فیلم را جستجو کنید..."
        className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
      />

      {error && <p className="mt-2 text-sm text-gold">{error}</p>}

      {searching && <p className="mt-2 text-sm text-muted">در حال جستجو...</p>}

      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleAdd(r.id)}
              disabled={adding === r.id}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/40 hover:bg-surface2 disabled:opacity-50"
            >
              <span>{r.title}</span>
              <span className="num text-xs text-gold">
                {adding === r.id ? "در حال افزودن..." : "+ افزودن"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}