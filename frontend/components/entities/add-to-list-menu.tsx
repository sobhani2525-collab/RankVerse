"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { createList, addListItem, getMyLists } from "@/lib/api";

export interface AddToListEntity {
  id: string;
  slug: string;
  entity_type: string;
}

// A row only needs id/slug/title -- ListSummary (what getMyLists returns)
// satisfies this shape with extra fields we don't use here.
interface MyListRow {
  id: string;
  slug: string;
  title: string;
}

/**
 * "افزودن به لیست ..." -- opens a menu with the ♥ favorites shortcut first,
 * the user's own lists in the middle (lazy-loaded on open), and an inline
 * quick-create row last. Mirrors SearchBox's dropdown shell (relative
 * container, absolute panel, click-outside-to-close).
 */
export default function AddToListMenu({ entity }: { entity: AddToListEntity }) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<MyListRow[] | null>(null);
  const [loadingLists, setLoadingLists] = useState(false);
  const [addedListIds, setAddedListIds] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function loadLists() {
    const token = getToken();
    if (!token || lists !== null) return;
    setLoadingLists(true);
    getMyLists(token)
      .then(setLists)
      .catch(() => setLists([]))
      .finally(() => setLoadingLists(false));
  }

  function handleToggleOpen() {
    requireAuth(() => {
      setOpen((prev) => {
        const next = !prev;
        if (next) loadLists();
        return next;
      });
    });
  }

  async function handleAddToList(list: MyListRow) {
    const token = getToken();
    if (!token || addedListIds.has(list.id)) return;

    setAddedListIds((prev) => new Set(prev).add(list.id));
    try {
      await addListItem(token, list.slug, { entity_id: entity.id });
    } catch {
      setAddedListIds((prev) => {
        const next = new Set(prev);
        next.delete(list.id);
        return next;
      });
    }
  }

  async function handleCreateList() {
    const token = getToken();
    const title = newTitle.trim();
    if (!token || !title || creating) return;

    setCreating(true);
    setError(null);
    try {
      const result = await createList(token, { title, entity_type: entity.entity_type });
      await addListItem(token, result.slug, { entity_id: entity.id });

      setLists((prev) => [{ id: result.id, slug: result.slug, title }, ...(prev ?? [])]);
      setAddedListIds((prev) => new Set(prev).add(result.id));
      setNewTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت لیست");
    } finally {
      setCreating(false);
    }
  }

  const favorited = isFavorite(entity.id);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3.5 py-2 text-xs text-muted transition hover:border-gold/40 hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        افزودن به لیست ...
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <button
            type="button"
            onClick={() => toggleFavorite(entity)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-right text-sm text-ink transition hover:bg-surface2"
          >
            <span>مورد علاقه‌ها</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={favorited ? "text-gold" : "text-muted"}>
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </svg>
          </button>

          <div className="border-t border-border">
            {loadingLists ? (
              <p className="px-3.5 py-2.5 text-xs text-muted">در حال بارگذاری...</p>
            ) : lists && lists.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                {lists.map((list) => {
                  const added = addedListIds.has(list.id);
                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => handleAddToList(list)}
                      disabled={added}
                      className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-right text-sm text-ink transition hover:bg-surface2 disabled:cursor-default"
                    >
                      <span className="truncate">{list.title}</span>
                      <span className="shrink-0 text-xs text-teal">{added ? "✓ افزوده شد" : ""}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-3.5 py-2.5 text-xs text-muted">هنوز لیستی نساخته‌اید</p>
            )}
          </div>

          <div className="border-t border-border p-2.5">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateList();
                  }
                }}
                placeholder="لیست جدید"
                disabled={creating}
                className="w-full min-w-0 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-ink placeholder:text-muted outline-none focus:border-gold/50"
              />
              <button
                type="button"
                onClick={handleCreateList}
                disabled={creating || !newTitle.trim()}
                className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
              >
                {creating ? "..." : "ایجاد"}
              </button>
            </div>
            {error && <p className="mt-1.5 text-[11px] text-gold">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
