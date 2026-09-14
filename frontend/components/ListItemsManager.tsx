"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { removeListItem, reorderListItems, voteListItem, removeListItemVote } from "@/lib/api";
import { ListItem, ListType } from "@/lib/types";

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

export default function ListItemsManager({
  slug,
  listType,
  isRanked,
  isOwner,
  initialItems,
}: {
  slug: string;
  listType: ListType;
  isRanked: boolean;
  isOwner: boolean;
  initialItems: ListItem[];
}) {
  const { token } = useAuth();
  const isCommunityOrdered = listType === "community_ordered";
  const [items, setItems] = useState(
    isCommunityOrdered ? initialItems : [...initialItems].sort((a, b) => a.position - b.position)
  );

  // ListDetailClient does an anonymous SSR fetch, then a client-side
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

  async function handleVote(itemId: string, isLike: boolean) {
    if (!token || votingId) return;
    const current = items.find((i) => i.id === itemId);
    if (!current) return;
    setVotingId(itemId);
    setError(null);
    const wasVote = current.my_vote;
    try {
      const result =
        wasVote === isLike
          ? await removeListItemVote(token, slug, itemId)
          : await voteListItem(token, slug, itemId, isLike);
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

  if (items.length === 0) {
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

      {items.map((item, idx) => {
        const posterUrl = item.entity.poster_path
          ? `https://image.tmdb.org/t/p/w200${item.entity.poster_path}`
          : null;
        return (
          <div
            key={item.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface/60 px-4 py-3"
          >
            {isRanked && !isCommunityOrdered && (
              <span className="num w-9 shrink-0 text-center text-lg text-muted">
                {String(idx + 1).padStart(2, "0")}
              </span>
            )}

            <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={item.entity.title}
                  width={44}
                  height={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  —
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <Link
                href={
                  item.entity.entity_type === "movie"
                    ? `/movies/${item.entity.slug}`
                    : "#"
                }
                className="truncate font-medium text-ink hover:text-gold"
              >
                {item.entity.title}
              </Link>
              {item.note && (
                <p className="mt-0.5 truncate text-sm text-muted">{item.note}</p>
              )}
            </div>

            {isCommunityOrdered && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => handleVote(item.id, true)}
                  disabled={!token || votingId === item.id}
                  className={`num flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition disabled:opacity-50 ${
                    item.my_vote === true
                      ? "border-teal/50 bg-teal/10 text-teal"
                      : "border-border text-muted hover:border-teal/40"
                  }`}
                  title="پسندیدم"
                >
                  ▲ {item.like_count}
                </button>
                <button
                  onClick={() => handleVote(item.id, false)}
                  disabled={!token || votingId === item.id}
                  className={`num flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition disabled:opacity-50 ${
                    item.my_vote === false
                      ? "border-red-500/50 bg-red-500/10 text-red-400"
                      : "border-border text-muted hover:border-red-500/40"
                  }`}
                  title="نپسندیدم"
                >
                  ▼ {item.dislike_count}
                </button>
              </div>
            )}

            {(isOwner || item.can_remove) && (
              <div className="flex shrink-0 items-center gap-1">
                {isOwner && isRanked && !isCommunityOrdered && (
                  <>
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="rounded-lg border border-border px-2 py-1.5 text-muted transition hover:border-gold/40 hover:text-gold disabled:opacity-30"
                      title="جابجایی به بالا"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === items.length - 1}
                      className="rounded-lg border border-border px-2 py-1.5 text-muted transition hover:border-gold/40 hover:text-gold disabled:opacity-30"
                      title="جابجایی به پایین"
                    >
                      ▼
                    </button>
                  </>
                )}
                {item.can_remove && (
                  <button
                    onClick={() => handleRemove(item.id)}
                    disabled={busyId === item.id}
                    className="rounded-lg border border-border px-2 py-1.5 text-muted transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                    title="حذف از لیست"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}