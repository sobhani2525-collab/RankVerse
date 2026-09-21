"use client";
import { useState } from "react";
import Link from "next/link";
import EntityMedia, { MediaKind } from "@/components/entities/entity-media";
import { detailPathFor } from "@/lib/entity-routes";
import { entityTypeBadgeClass, entityTypeLabel } from "@/lib/constants";
import { relativeTimeFa } from "@/lib/relative-time";
import { toggleListLike } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toFaDigits } from "@/lib/format-number";

export interface ListCardItem {
  id: string;
  title: string;
  slug?: string | null;
  entity_type?: string | null;
  posterUrl?: string | null;
  mediaKind?: MediaKind;
}

export interface ListCardAuthor {
  username: string;
  avatarUrl?: string | null;
  /** Only rendered as a real <Link> when present -- callers that don't
   *  have a username to build /profile/[username] from should leave this
   *  undefined rather than pointing at a dead URL. */
  profileHref?: string | null;
}

export interface ListCardList {
  id: string;
  slug: string;
  title: string;
  /** First few items, used for the poster collage and the "شامل: " line.
   *  Populated by /lists (ListSummary.preview_items, up to 3, position
   *  order); empty for callers that pass a ListSummary without eager-loaded
   *  items (see listSummaryToListCard's doc comment). */
  items?: ListCardItem[];
  /** entity_type -> count. Same caveat as `items`: no list summary
   *  endpoint currently returns per-type counts. */
  countsByType?: Record<string, number> | null;
  likesCount?: number | null;
  updatedAt?: string | null;
  author?: ListCardAuthor | null;
}

const COLLAGE_SLOTS = 3;

export default function ListCard({ list }: { list: ListCardList }) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const href = `/lists/${list.slug}`;
  const items = list.items ?? [];
  const typeCounts = Object.entries(list.countsByType ?? {});
  const displayedItems = items.slice(0, 4);
  const hasMoreItems = items.length > displayedItems.length;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(list.likesCount ?? 0);
  const [likeBusy, setLikeBusy] = useState(false);

  async function doLike() {
    const token = getToken();
    if (!token || likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await toggleListLike(token, list.slug);
      setLiked(res.liked);
      setLikeCount((c) => c + (res.liked ? 1 : -1));
    } catch {
      // silently ignore; UI stays consistent with last known state
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/60 transition hover:border-teal/30">
      <Link href={href} aria-label={list.title} className="relative flex h-28 md:h-56">
        {Array.from({ length: COLLAGE_SLOTS }).map((_, i) => {
          const item = items[i];
          return (
            <div key={item?.id ?? `empty-${i}`} className="relative flex-1 bg-surface2">
              <EntityMedia
                src={item?.posterUrl}
                alt={item?.title ?? list.title}
                mediaKind={item ? item.mediaKind ?? "image" : "none"}
              />
            </div>
          );
        })}
        {/* First item (rightmost in RTL) stays clearest; third item (leftmost) fades darkest. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-l from-transparent to-black/85" />
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4 md:p-6">
        {typeCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {typeCounts.map(([type, count]) => (
              <span
                key={type}
                className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${entityTypeBadgeClass(type)}`}
              >
                <span className="num">{toFaDigits(count)}</span> {entityTypeLabel(type)}
              </span>
            ))}
          </div>
        )}

        <Link href={href} className="text-base font-extrabold leading-snug text-ink hover:text-teal md:text-lg">
          {list.title}
        </Link>

        {displayedItems.length > 0 && (
          <p className="text-xs leading-relaxed text-muted">
            شامل:{" "}
            {displayedItems.map((item, i) => (
              <span key={item.id}>
                {item.slug && item.entity_type ? (
                  <Link href={detailPathFor(item.entity_type, item.slug) ?? href} className="text-ink hover:text-teal">
                    {item.title}
                  </Link>
                ) : (
                  <span className="text-ink">{item.title}</span>
                )}
                {i < displayedItems.length - 1 && <span className="text-muted/70">، </span>}
              </span>
            ))}
            {hasMoreItems && <span className="text-muted/70">و...</span>}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border-soft pt-2.5 text-[11px] text-muted/80">
          <span className="text-right">
            {list.updatedAt && relativeTimeFa(list.updatedAt)}
          </span>
          {list.likesCount != null && (
            <button
              type="button"
              onClick={() => requireAuth(doLike)}
              disabled={likeBusy}
              aria-pressed={liked}
              className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${
                liked
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-border text-muted hover:border-gold/40 hover:bg-surface2 hover:text-gold"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
              <span className="num">{toFaDigits(likeCount)}</span>
            </button>
          )}
        </div>

        {list.author && (
          <div className="flex items-center gap-2">
            <AuthorAvatar author={list.author} />
            {list.author.profileHref ? (
              <Link href={list.author.profileHref} className="text-xs text-muted">
                فهرست از <span className="text-teal">{list.author.username}</span>
              </Link>
            ) : (
              <span className="text-xs text-muted">
                فهرست از <span className="text-teal">{list.author.username}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Exported so the public profile page (app/profile/[username]) can reuse
 *  the same avatar look at a larger size for its header. */
export function AuthorAvatar({
  author,
  sizeClassName = "h-6 w-6",
  textClassName = "text-[10px]",
}: {
  author: ListCardAuthor;
  sizeClassName?: string;
  textClassName?: string;
}) {
  if (author.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small avatar isn't worth next/image's overhead here
      <img src={author.avatarUrl} alt="" className={`${sizeClassName} shrink-0 rounded-full object-cover`} />
    );
  }

  return (
    <div
      className={`flex ${sizeClassName} shrink-0 items-center justify-center rounded-full bg-gradient-brand ${textClassName} font-bold text-ink`}
    >
      {author.username.charAt(0).toUpperCase()}
    </div>
  );
}
