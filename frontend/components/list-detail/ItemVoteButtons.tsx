"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { removeListItemVote, voteListItem } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { useListViewer } from "./ListViewerContext";
import { ThumbsDownIcon, ThumbsUpIcon } from "./icons";

type VoteState = { like_count: number; dislike_count: number; my_vote: boolean | null };

/** Tapping the active vote clears it; tapping the other one switches. */
function nextState(state: VoteState, isLike: boolean): VoteState {
  const my_vote = state.my_vote === isLike ? null : isLike;
  const count = (vote: boolean) =>
    (vote ? state.like_count : state.dislike_count) - (state.my_vote === vote ? 1 : 0) + (my_vote === vote ? 1 : 0);
  return { like_count: count(true), dislike_count: count(false), my_vote };
}

const BUTTON =
  "num flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-bold transition-[background-color,border-color,color] duration-[160ms] disabled:cursor-default";
const IDLE = "border-[#2A3247] bg-transparent text-[#C9CFDC] hover:border-[#3A4560]";
const LIKED = "border-[#4CC9A6] bg-[rgba(76,201,166,0.14)] text-[#4CC9A6]";
const DISLIKED = "border-[#F07178] bg-[rgba(240,113,120,0.14)] text-[#F07178]";

/**
 * An item's button row: like, dislike (the list-item votes, same endpoints
 * as ListItemsManager) and whatever `trailing` holds (the battle link), all
 * equal widths. A vote flips immediately and rolls back if the request
 * fails. On a community-ordered list the page then refreshes so the spine
 * re-sorts by the new scores.
 */
export default function ItemVoteButtons({
  itemId,
  initial,
  trailing,
  pending = false,
}: {
  itemId: string;
  initial: VoteState;
  trailing?: React.ReactNode;
  /** The item is still being saved (optimistic add) -- nothing to vote on yet. */
  pending?: boolean;
}) {
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
    if (!token || busy || pending) return;
    const prev = state;
    setLocal(nextState(prev, isLike));
    setBusy(true);
    setError(null);
    try {
      const result =
        prev.my_vote === isLike
          ? await removeListItemVote(token, slug, itemId)
          : await voteListItem(token, slug, itemId, isLike);
      setLocal({ like_count: result.like_count, dislike_count: result.dislike_count, my_vote: result.my_vote });
      if (detail.list_type === "community_ordered") refresh();
    } catch {
      setLocal(prev);
      setError("رأی ثبت نشد. دوباره تلاش کن.");
    } finally {
      setBusy(false);
    }
  }

  const liked = state.my_vote === true;
  const disliked = state.my_vote === false;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => requireAuth(() => vote(true))}
          disabled={busy || pending}
          aria-pressed={liked}
          aria-label="پسندیدم"
          className={`${BUTTON} ${liked ? LIKED : IDLE}`}
        >
          <ThumbsUpIcon fill={liked ? "rgba(76,201,166,0.35)" : "none"} />
          {toFaDigits(state.like_count)}
        </button>
        <button
          type="button"
          onClick={() => requireAuth(() => vote(false))}
          disabled={busy || pending}
          aria-pressed={disliked}
          aria-label="نپسندیدم"
          className={`${BUTTON} ${disliked ? DISLIKED : IDLE}`}
        >
          <ThumbsDownIcon fill={disliked ? "rgba(240,113,120,0.35)" : "none"} />
          {toFaDigits(state.dislike_count)}
        </button>
        {trailing}
      </div>
      {error && <p className="text-xs text-[#F07178]" role="alert">{error}</p>}
    </div>
  );
}
