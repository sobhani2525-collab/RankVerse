"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { removeListItem } from "@/lib/api";
import { BATTLE_SECTION_ID, withoutItem } from "@/lib/list-constellation";
import { useListViewer } from "./ListViewerContext";
import { SwordsIcon, TrashIcon } from "./icons";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** "نبرد": scrolls to this page's step-by-step battle (ListBattlePreview). */
export function BattleJumpButton() {
  function jump() {
    document
      .getElementById(BATTLE_SECTION_ID)
      ?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
  return (
    <button
      type="button"
      onClick={jump}
      className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] border border-violet-strong/60 text-[13px] font-bold text-violet-light transition-[border-color,color] duration-[160ms] hover:border-violet-light"
    >
      <SwordsIcon size={18} />
      نبرد
    </button>
  );
}

/**
 * Removes the item from the list (owner, or whoever added it). The card
 * fades while the request runs (`onRemoving`), then leaves the spine --
 * with the gap's new edge computed locally -- and the page refetches so
 * the server recomputes every edge and backlink. A failure keeps the item
 * and says so.
 */
export function RemoveItemButton({
  itemId,
  title,
  onRemoving,
}: {
  itemId: string;
  title: string;
  onRemoving: (removing: boolean) => void;
}) {
  const { getToken } = useAuth();
  const { slug, setItemsDetail, refresh } = useListViewer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const token = getToken();
    if (!token || busy) return;
    if (!confirm(`«${title}» از لیست حذف شود؟`)) return;
    setBusy(true);
    setError(null);
    onRemoving(true);
    try {
      await removeListItem(token, slug, itemId);
      setItemsDetail((current) => withoutItem(current, itemId));
      refresh();
    } catch {
      onRemoving(false);
      setBusy(false);
      setError("حذف آیتم انجام نشد. دوباره تلاش کن.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={`حذف ${title} از لیست`}
        title="حذف از لیست"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[#2A3247] text-[#C9CFDC] transition-[border-color,color] duration-[160ms] hover:border-[#F07178] hover:text-[#F07178]"
      >
        <TrashIcon size={18} />
      </button>
      {error && (
        <p className="basis-full text-xs text-[#F07178]" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
