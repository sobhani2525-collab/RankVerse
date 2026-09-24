"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { removeListItemVote, voteListItem } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { useListViewer } from "./ListViewerContext";

type VoteState = { like_count: number; dislike_count: number; my_vote: boolean | null };

/**
 * Like/dislike on a community-ordered list's item (same endpoints as
 * ListItemsManager). The viewer's own vote comes from the authed refetch
 * in ListViewerContext; after voting, the page refreshes so the spine
 * re-sorts by the new scores.
 */
export default function ItemVoteButtons({ itemId, initial }: { itemId: string; initial: VoteState }) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const { slug, detail, refresh } = useListViewer();
  const viewerItem = detail.items.find((i) => i.id === itemId);
  const [local, setLocal] = useState<VoteState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLocal(null), [viewerItem]);

  const state: VoteState = local ?? (viewerItem
    ? { like_count: viewerItem.like_count, dislike_count: viewerItem.dislike_count, my_vote: viewerItem.my_vote }
    : initial);

  async function vote(isLike: boolean) {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        state.my_vote === isLike
          ? await removeListItemVote(token, slug, itemId)
          : await voteListItem(token, slug, itemId, isLike);
      setLocal({ like_count: result.like_count, dislike_count: result.dislike_count, my_vote: result.my_vote });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت رای");
    } finally {
      setBusy(false);
    }
  }

  const base = "num flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-[10px] border px-3 text-[13px] transition disabled:opacity-50 lg:h-10";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => requireAuth(() => vote(true))}
          disabled={busy}
          aria-pressed={state.my_vote === true}
          aria-label="پسندیدم"
          className={`${base} ${state.my_vote === true ? "border-teal/60 bg-teal/10 text-teal" : "border-border text-muted hover:border-teal/40"}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 22V11m0 11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3m0 11h9.28a2 2 0 0 0 1.98-1.72l1.13-8A2 2 0 0 0 17.42 10H14V5a2 2 0 0 0-2-2l-3 7.5" />
          </svg>
          {toFaDigits(state.like_count)}
        </button>
        <button
          type="button"
          onClick={() => requireAuth(() => vote(false))}
          disabled={busy}
          aria-pressed={state.my_vote === false}
          aria-label="نپسندیدم"
          className={`${base} ${state.my_vote === false ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-border text-muted hover:border-red-500/40"}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 2v11m0-11h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3m0-11H7.72a2 2 0 0 0-1.98 1.72l-1.13 8A2 2 0 0 0 6.58 14H10v5a2 2 0 0 0 2 2l3-7.5" />
          </svg>
          {toFaDigits(state.dislike_count)}
        </button>
      </div>
      {error && <p className="text-xs text-gold">{error}</p>}
    </div>
  );
}
