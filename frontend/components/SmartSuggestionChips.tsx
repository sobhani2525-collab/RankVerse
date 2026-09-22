"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { getListSuggestions, addListItem, SmartSuggestion } from "@/lib/api";
import { entityTypeLabel } from "@/lib/constants";

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
    <div className="mb-4">
      <p className="mb-2.5 text-sm font-semibold text-muted">پیشنهاد سریع</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
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
              className="flex w-32 shrink-0 flex-col items-center rounded-xl border border-border bg-surface px-2.5 py-2.5 text-center transition hover:border-teal/50 hover:bg-surface2 disabled:opacity-50"
            >
              <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface2">
                {posterUrl ? (
                  <Image
                    src={posterUrl}
                    alt={s.entity.title}
                    width={112}
                    height={168}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted">
                    —
                  </div>
                )}
              </div>
              <span className="mt-1.5 line-clamp-1 w-full text-[11px] font-semibold text-muted">
                {entityTypeLabel(s.entity.entity_type)}
              </span>
              <span className="line-clamp-2 w-full text-sm font-medium text-ink">{s.entity.title}</span>
              <span className="line-clamp-1 w-full text-xs text-teal">
                {addingId === s.entity.id ? "در حال افزودن..." : s.reason_label_fa}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
