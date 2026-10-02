import Link from "next/link";
import type { ListSummary } from "@/lib/types";
import { TAG_CHIP } from "@/lib/list-constellation";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { Chip, MonoLabel } from "@/components/list-detail/ui";
import { AuthorAvatar } from "./list-card";
import ListSky from "./list-sky";

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={label}>
      {icon}
      <span className="num">{toFaDigits(value)}</span>
    </span>
  );
}

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function StatRow({ list }: { list: ListSummary }) {
  return (
    <div className="flex items-center gap-4">
      <Stat
        label="پسند"
        value={list.like_count}
        icon={<svg {...ICON_PROPS}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>}
      />
      <Stat
        label="دیدگاه"
        value={list.comment_count}
        icon={<svg {...ICON_PROPS}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>}
      />
      <Stat
        label="دنبال‌کننده"
        value={list.follower_count}
        icon={<svg {...ICON_PROPS}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>}
      />
    </div>
  );
}

/** A list on /lists: a mini constellation of its first titles over the list's meta. */
export default function ConstellationListCard({ list, delay = 0 }: { list: ListSummary; delay?: number }) {
  const href = `/lists/${list.slug}`;
  return (
    <article
      className="rv-rise group flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface transition hover:border-teal/40 hover:shadow-[0_0_0_1px_rgba(79,184,166,0.25),0_18px_40px_-20px_rgba(145,99,245,0.45)]"
      style={{ ["--rv-delay" as string]: `${delay}ms` }}
    >
      <Link href={href} aria-label={list.title} className="block border-b border-border-soft">
        <ListSky items={list.preview_items} />
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
        <div className="flex items-center gap-2">
          <MonoLabel size="text-[10px]" className="text-gold">
            {list.is_ranked ? "RANKED" : "LIST"}
          </MonoLabel>
          <span className="text-xs text-muted">{list.is_ranked ? "فهرست رتبه‌بندی‌شده" : "مجموعه"}</span>
        </div>

        <Link href={href} className="text-lg font-extrabold leading-snug text-ink transition hover:text-gold">
          {list.title}
        </Link>

        {list.description && <p className="line-clamp-2 text-[13px] leading-[1.8] text-muted">{list.description}</p>}

        {list.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {list.tags.slice(0, 3).map((tag) => (
              <Chip key={tag} href={`/lists?tag=${encodeURIComponent(tag)}`} tone={TAG_CHIP} className="!min-h-[28px] !px-2.5 !text-xs hover:border-teal/50 hover:text-teal">
                #{tag}
              </Chip>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-soft pt-3">
          {list.owner_username ? (
            <Link href={`/profile/${list.owner_username}`} className="flex min-w-0 items-center gap-2 text-xs text-muted hover:text-ink">
              <AuthorAvatar author={{ username: list.owner_username }} />
              <span dir="ltr" className="truncate">@{list.owner_username}</span>
            </Link>
          ) : (
            <span className="text-xs text-dim">{relativeTimeFa(list.created_at)}</span>
          )}
          <StatRow list={list} />
        </div>
      </div>
    </article>
  );
}
