"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { getListSuggestions, addListItem, SmartSuggestion } from "@/lib/api";

export default function SmartSuggestionChips({
  listId,
  slug,
  itemCount,
  onAdded,
}: {
  listId: string;
  slug: string;
  itemCount: number;
  onAdded: () => void;
}) {
  const { getToken } = useAuth();
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (itemCount < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    getListSuggestions(listId)
      .then((res) => {
        if (!cancelled) setSuggestions(res);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listId, itemCount]);

  async function handleAdd(entityId: string) {
    const token = getToken();
    if (!token || addingId) return;
    setAddingId(entityId);
    try {
      await addListItem(token, slug, { entity_id: entityId });
      setAddedIds((prev) => new Set(prev).add(entityId));
      onAdded();
    } catch {
      // stays visible so the user can retry, or fall back to the search box below
    } finally {
      setAddingId(null);
    }
  }

  const visible = suggestions.filter((s) => !addedIds.has(s.entity.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-2 text-xs text-muted">پیشنهاد سریع</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {visible.map((s) => {
          const posterUrl = s.entity.poster_path
            ? `https://image.tmdb.org/t/p/w200${s.entity.poster_path}`
            : null;
          return (
            <button
              key={s.entity.id}
              type="button"
              onClick={() => handleAdd(s.entity.id)}
              disabled={addingId === s.entity.id}
              className="flex w-24 shrink-0 flex-col items-center rounded-lg border border-border bg-surface px-2 py-2 text-center transition hover:border-teal/50 hover:bg-surface2 disabled:opacity-50"
            >
              <div className="h-24 w-16 overflow-hidden rounded-md bg-surface2">
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={s.entity.title}
                    width={64}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                    —
                  </div>
                )}
              </div>
              <span className="mt-1 line-clamp-1 w-full text-xs text-ink">{s.entity.title}</span>
              <span className="line-clamp-1 w-full text-[10px] text-teal">
                {addingId === s.entity.id ? "در حال افزودن..." : s.reason_label_fa}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
