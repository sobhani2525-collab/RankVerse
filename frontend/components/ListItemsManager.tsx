"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { removeListItem, reorderListItems, voteListItem, removeListItemVote } from "@/lib/api";
import { ListItem, ListType } from "@/lib/types";
import { entityTypeLabel } from "@/lib/constants";
import { detailPathFor } from "@/lib/entity-routes";
import EntityMedia from "@/components/entities/entity-media";
import { toFaDigits } from "@/lib/format-number";
import { ThumbsDownIcon, ThumbsUpIcon } from "@/components/list-detail/icons";

// Mirrors the default in app/config.py (list_item_score_global_avg) so a
// freshly-voted item can be re-sorted optimistically before the next full
// refetch confirms the server's exact score.
const FALLBACK_SCORE = 0.5;

function communityOrderKey(item: ListItem): [number, string, string] {
  const score = item.like_score ?? FALLBACK_SCORE;
  return [-score, item.added_at, item.id];
}

function compareCommunityOrder(a: ListItem, b: ListItem): number {
  const [sa, da, ia] = communityOrderKey(a);
  const [sb, db, ib] = communityOrderKey(b);
  if (sa !== sb) return sa - sb;
  if (da !== db) return da < db ? -1 : 1;
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

function posterUrlFor(posterPath: string | null): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/w300${posterPath}` : null;
}

export default function ListItemsManager({
  slug,
  listType,
  isRanked,
  isOwner,
  initialItems,
  canAddItem = false,
  showingAddForm = false,
  onRequestAdd,
}: {
  slug: string;
  listType: ListType;
  isRanked: boolean;
  isOwner: boolean;
  initialItems: ListItem[];
  /** Whether the "افزودن آیتم" tile should appear after the last item. */
  canAddItem?: boolean;
  /** Hides the tile while the add-item form (rendered by the caller) is open. */
  showingAddForm?: boolean;
  onRequestAdd?: () => void;
}) {
  const { token, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const isCommunityOrdered = listType === "community_ordered";
  const [items, setItems] = useState(
    isCommunityOrdered ? initialItems : [...initialItems].sort((a, b) => a.position - b.position)
  );

  // The list page does an anonymous SSR fetch, then ListViewerContext a client-side
  // authenticated refetch (different is_own/can_remove/my_vote per viewer).
  // Re-sync whenever the parent hands us a new items array, not just on
  // first mount, so that second fetch's per-viewer fields actually land.
  useEffect(() => {
    setItems(
      isCommunityOrdered ? initialItems : [...initialItems].sort((a, b) => a.position - b.position)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function performVote(itemId: string, isLike: boolean) {
    const authToken = getToken();
    if (!authToken) return;
    const current = items.find((i) => i.id === itemId);
    if (!current) return;
    setVotingId(itemId);
    setError(null);
    const wasVote = current.my_vote;
    try {
      const result =
        wasVote === isLike
          ? await removeListItemVote(authToken, slug, itemId)
          : await voteListItem(authToken, slug, itemId, isLike);
      setItems((prev) => {
        const next = prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                like_score: result.like_score,
                like_count: result.like_count,
                dislike_count: result.dislike_count,
                my_vote: result.my_vote,
              }
            : i
        );
        return isCommunityOrdered ? [...next].sort(compareCommunityOrder) : next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت رای");
    } finally {
      setVotingId(null);
    }
  }

  function handleVote(itemId: string, isLike: boolean) {
    if (votingId) return;
    requireAuth(() => performVote(itemId, isLike));
  }

  async function persistOrder(newItems: ListItem[]) {
    if (!token) return;
    setItems(newItems);
    try {
      await reorderListItems(token, slug, newItems.map((i) => i.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در تغییر ترتیب");
    }
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    persistOrder(next);
  }

  function moveDown(index: number) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    persistOrder(next);
  }

  async function handleRemove(itemId: string) {
    if (!token) return;
    if (!confirm("این آیتم از لیست حذف شود؟")) return;
    setBusyId(itemId);
    setError(null);
    try {
      await removeListItem(token, slug, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در حذف آیتم");
    } finally {
      setBusyId(null);
    }
  }

  const showAddTile = canAddItem && !showingAddForm && !!onRequestAdd;

  if (items.length === 0 && !showAddTile) {
    return (
      <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
        این لیست هنوز آیتمی ندارد.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.map((item, idx) => {
          const posterUrl = posterUrlFor(item.entity.poster_path);
          const href = detailPathFor(item.entity.entity_type, item.entity.slug) ?? "#";
          const canReorder = isOwner && isRanked && !isCommunityOrdered;
          const canRemove = isOwner || item.can_remove;

          return (
            <div key={item.id} className="flex flex-col">
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-border-soft bg-surface2">
                <Link href={href} className="absolute inset-0" aria-label={item.entity.title}>
                  <EntityMedia src={posterUrl} alt={item.entity.title} mediaKind={posterUrl ? "image" : "none"} />
                </Link>

                {isRanked && !isCommunityOrdered && (
                  <div
                    className="pointer-events-none absolute right-2 top-2 h-9 w-9 rounded-full p-[1.5px]"
                    style={{ background: "linear-gradient(135deg, #9163f5, #4FB8A6)" }}
                  >
                    <div
                      className="num flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-ink backdrop-blur-sm"
                      style={{ background: "rgba(7,11,22,.85)" }}
                    >
                      {toFaDigits(idx + 1)}
                    </div>
                  </div>
                )}

                {canRemove && (
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={busyId === item.id}
                    aria-label="حذف از لیست"
                    title="حذف از لیست"
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-border text-ink backdrop-blur-sm transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                    style={{ background: "rgba(7,11,22,.7)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex flex-col gap-1.5">
                <span className="text-[10.5px] font-semibold text-muted">
                  {entityTypeLabel(item.entity.entity_type)}
                </span>

                <Link href={href} className="truncate text-sm font-bold text-ink hover:text-teal">
                  {item.entity.title}
                </Link>

                {item.note && <p className="truncate text-xs text-muted">{item.note}</p>}

                {isCommunityOrdered ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleVote(item.id, true)}
                      disabled={votingId === item.id}
                      aria-pressed={item.my_vote === true}
                      aria-label="پسندیدم"
                      className={`num flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-[background-color,border-color,color] duration-[160ms] disabled:opacity-50 ${
                        item.my_vote === true
                          ? "border-[#4CC9A6] bg-[rgba(76,201,166,0.14)] text-[#4CC9A6]"
                          : "border-[#2A3247] text-[#C9CFDC] hover:border-[#3A4560]"
                      }`}
                      title="پسندیدم"
                    >
                      <ThumbsUpIcon size={14} fill={item.my_vote === true ? "rgba(76,201,166,0.35)" : "none"} />
                      {toFaDigits(item.like_count)}
                    </button>
                    <button
                      onClick={() => handleVote(item.id, false)}
                      disabled={votingId === item.id}
                      aria-pressed={item.my_vote === false}
                      aria-label="نپسندیدم"
                      className={`num flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold transition-[background-color,border-color,color] duration-[160ms] disabled:opacity-50 ${
                        item.my_vote === false
                          ? "border-[#F07178] bg-[rgba(240,113,120,0.14)] text-[#F07178]"
                          : "border-[#2A3247] text-[#C9CFDC] hover:border-[#3A4560]"
                      }`}
                      title="نپسندیدم"
                    >
                      <ThumbsDownIcon size={14} fill={item.my_vote === false ? "rgba(240,113,120,0.35)" : "none"} />
                      {toFaDigits(item.dislike_count)}
                    </button>
                  </div>
                ) : (
                  canReorder && (
                    <div className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-border bg-surface/40 p-0.5">
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        title="جابجایی به بالا"
                        aria-label="جابجایی به بالا"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-teal/10 hover:text-teal disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M6 15l6-6 6 6" />
                        </svg>
                      </button>
                      <span className="h-4 w-px bg-border" />
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx === items.length - 1}
                        title="جابجایی به پایین"
                        aria-label="جابجایی به پایین"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-teal/10 hover:text-teal disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}

        {showAddTile && (
          <button
            type="button"
            onClick={onRequestAdd}
            className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold/40 bg-gold/5 text-gold transition hover:border-gold/70 hover:bg-gold/10"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/50 text-xl leading-none">
              +
            </span>
            <span className="text-xs font-bold">افزودن آیتم</span>
          </button>
        )}
      </div>
    </div>
  );
}
