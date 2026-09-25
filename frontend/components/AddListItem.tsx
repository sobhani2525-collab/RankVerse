"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { searchEntities, addListItem, SearchResult } from "@/lib/api";
import SmartSuggestionChips from "./SmartSuggestionChips";
import { entityTypeLabel } from "@/lib/constants";
import { displayTitle } from "@/lib/title";
import { useDebouncedValue } from "@/lib/use-debounced-value";

const SEARCHABLE_TYPES = ["movie", "tv_series", "person"];

export default function AddListItem({
  slug,
  listId,
  itemCount,
  entityType,
  onAdded,
  onSelectPending,
  selectedIds,
}: {
  slug?: string;
  listId?: string;
  itemCount?: number;
  entityType: string | null;
  onAdded?: () => void;
  /**
   * When set, picking a result adds it to the caller's own local
   * (unsaved) list instead of calling addListItem -- used by NewListForm,
   * where there's no slug/listId yet because the list doesn't exist.
   */
  onSelectPending?: (result: SearchResult) => void;
  /** Ids already picked in pending mode, so they render disabled instead of re-addable. */
  selectedIds?: string[];
}) {
  const { token } = useAuth();
  const isPending = !!onSelectPending;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState(entityType || "movie");
  const debouncedQuery = useDebouncedValue(query, 350);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchEntities(debouncedQuery, activeType)
      .then((items) => {
        if (!cancelled) setResults(items);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, activeType]);

  function handleSelect(result: SearchResult) {
    if (isPending) {
      onSelectPending?.(result);
      setQuery("");
      setResults([]);
      return;
    }
    handleAdd(result.id);
  }

  async function handleAdd(entityId: string) {
    if (!token || !slug) return;
    setAdding(entityId);
    setError(null);
    try {
      await addListItem(token, slug, { entity_id: entityId });
      setQuery("");
      setResults([]);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در افزودن آیتم");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface/60 p-4">
      <label className="mb-2 block text-sm text-muted">افزودن آیتم به لیست</label>

      {!isPending && listId && slug && itemCount !== undefined && (
        <SmartSuggestionChips listId={listId} slug={slug} itemCount={itemCount} onAdded={onAdded!} />
      )}

      {!entityType && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SEARCHABLE_TYPES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveType(key);
                setResults([]);
              }}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                activeType === key
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-border text-muted"
              }`}
            >
              {entityTypeLabel(key)}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`جستجوی ${entityTypeLabel(activeType)}...`}
        className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
      />

      {error && <p className="mt-2 text-sm text-gold">{error}</p>}

      {searching && <p className="mt-2 text-sm text-muted">در حال جستجو...</p>}

      {!searching && query.trim() && results.length === 0 && (
        <p className="mt-2 text-sm text-muted">نتیجه‌ای پیدا نشد.</p>
      )}

      {results.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {results.map((r) => {
            const alreadySelected = !!selectedIds?.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => handleSelect(r)}
                disabled={adding === r.id || alreadySelected}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/40 hover:bg-surface2 disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <span className="relative h-10 w-7 shrink-0 overflow-hidden rounded bg-surface2">
                    {r.image_url ? (
                      <Image src={r.image_url} alt="" fill sizes="28px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 bg-gradient-brand" />
                    )}
                  </span>
                  <span>{displayTitle(r)}</span>
                  <span className="text-xs text-muted">{entityTypeLabel(r.type)}</span>
                </span>
                <span className="num text-xs text-gold">
                  {adding === r.id
                    ? "در حال افزودن..."
                    : alreadySelected
                      ? "افزوده شد"
                      : "+ افزودن"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}