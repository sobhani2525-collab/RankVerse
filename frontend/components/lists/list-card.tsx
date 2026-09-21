import Link from "next/link";
import EntityMedia, { MediaKind } from "@/components/entities/entity-media";
import { detailPathFor } from "@/lib/entity-routes";
import { entityTypeBadgeClass, entityTypeLabel } from "@/lib/constants";
import { relativeTimeFa } from "@/lib/relative-time";

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
  /** Only rendered as a real <Link> when present -- no public profile route
   *  exists for arbitrary usernames yet, so callers that don't have one
   *  should leave this undefined rather than pointing at a dead URL. */
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
  const href = `/lists/${list.slug}`;
  const items = list.items ?? [];
  const typeCounts = Object.entries(list.countsByType ?? {});
  const displayedItems = items.slice(0, 4);
  const hasMoreItems = items.length > displayedItems.length;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/60 transition hover:border-teal/30">
      <Link href={href} aria-label={list.title} className="flex h-28 gap-[3px] md:h-56">
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
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4 md:p-6">
        {typeCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {typeCounts.map(([type, count]) => (
              <span
                key={type}
                className={`num rounded-md border px-2 py-0.5 text-[11px] font-bold ${entityTypeBadgeClass(type)}`}
              >
                {count} {entityTypeLabel(type)}
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
            {hasMoreItems && <span className="text-muted/70">…</span>}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border-soft pt-2.5 text-[11px] text-muted/80">
          <span className="flex items-center gap-1">
            {list.updatedAt && <span className="num">{relativeTimeFa(list.updatedAt)}</span>}
            {list.updatedAt && list.author?.username && <span>توسط</span>}
            {list.author?.username && <span dir="ltr" className="text-teal">@{list.author.username}</span>}
          </span>
          {list.likesCount != null && (
            <span className="num flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
              {list.likesCount}
            </span>
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

function AuthorAvatar({ author }: { author: ListCardAuthor }) {
  if (author.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a 24px avatar isn't worth next/image's overhead here
      <img src={author.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
    );
  }

  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[10px] font-bold text-ink">
      {author.username.charAt(0).toUpperCase()}
    </div>
  );
}
