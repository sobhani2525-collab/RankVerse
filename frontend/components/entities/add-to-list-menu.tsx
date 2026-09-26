"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useWatchLater } from "@/contexts/WatchLaterContext";
import { createList, addListItem, getMyLists } from "@/lib/api";
import { MonoLabel } from "@/components/list-detail/ui";
import { PlusIcon } from "@/components/list-detail/icons";

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

/** A 44px checkbox-style row shared by the favorites/watch-later shortcuts
 *  and each of the user's lists -- teal check when active/added. */
function CheckRow({
  label,
  checked,
  disabled = false,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 text-start text-sm text-ink transition hover:bg-surface-2 disabled:cursor-default"
    >
      <span className="truncate">{label}</span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition ${
          checked ? "border-teal bg-teal/15 text-teal" : "border-border text-transparent"
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    </button>
  );
}

/**
 * "+ افزودن به لیست…" -- opens a "MY LISTS" popover: the ♥ favorites and
 * "بعداً تماشا می‌کنم" shortcuts first, the user's own lists as checkbox
 * rows (lazy-loaded on open), and an inline quick-create row last. Mirrors
 * SearchBox's dropdown shell (relative container, absolute panel,
 * click-outside-to-close).
 */
export default function AddToListMenu({ entity }: { entity: AddToListEntity }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { isWatchLater, toggleWatchLater } = useWatchLater();

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

  // Navigates to the new list's page on success (instead of just closing the
  // menu) so the user lands where they can keep adding items to it --
  // `creating` deliberately stays true through the redirect so the form
  // can't be resubmitted while the page transitions.
  async function handleCreateList() {
    const token = getToken();
    const title = newTitle.trim();
    if (!token || !title || creating) return;

    setCreating(true);
    setError(null);
    try {
      const result = await createList(token, { title, entity_type: entity.entity_type });
      await addListItem(token, result.slug, { entity_id: entity.id });
      router.push(`/lists/${result.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت لیست");
      setCreating(false);
    }
  }

  const favorited = isFavorite(entity.id);
  const watchingLater = isWatchLater(entity.id);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        className="flex h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-extrabold text-bg transition hover:bg-ink/90"
      >
        <PlusIcon size={16} />
        افزودن به لیست…
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-72 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2.5">
            <MonoLabel size="text-[10px]" className="text-dim">
              MY LISTS
            </MonoLabel>
            <span className="text-xs text-muted">لیست‌های من</span>
          </div>

          <CheckRow label="بعداً تماشا می‌کنم" checked={watchingLater} onClick={() => toggleWatchLater(entity.id)} />
          <div className="border-t border-border-soft">
            <CheckRow label="مورد علاقه‌ها" checked={favorited} onClick={() => toggleFavorite(entity)} />
          </div>

          <div className="border-t border-border-soft">
            {loadingLists ? (
              <p className="px-3.5 py-2.5 text-xs text-muted">در حال بارگذاری...</p>
            ) : lists && lists.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                {lists.map((list) => (
                  <CheckRow
                    key={list.id}
                    label={list.title}
                    checked={addedListIds.has(list.id)}
                    disabled={addedListIds.has(list.id)}
                    onClick={() => handleAddToList(list)}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3.5 py-2.5 text-xs text-muted">هنوز لیستی نساخته‌اید</p>
            )}
          </div>

          <div className="border-t border-border-soft p-2.5">
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
                placeholder="+ لیست جدید"
                disabled={creating}
                className="h-11 w-full min-w-0 rounded-xl border border-border bg-bg px-3 text-sm text-ink placeholder:text-muted outline-none focus:border-teal/50"
              />
              <button
                type="button"
                onClick={handleCreateList}
                disabled={creating || !newTitle.trim()}
                className="h-11 shrink-0 rounded-xl bg-gold px-3.5 text-xs font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
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
