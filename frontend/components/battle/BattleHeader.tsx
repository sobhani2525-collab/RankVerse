import Link from "next/link";
import type { ReactNode } from "react";
import { AuthorAvatar } from "@/components/lists/list-card";
import { avatarByKey } from "@/lib/avatars";
import { toFaDigits } from "@/lib/format-number";

export interface BattleHeaderData {
  title: string;
  description?: string | null;
  creator?: { username: string; display_name: string | null; avatar_key: string | null } | null;
  /** How many entries the battle has. */
  optionCount: number;
  followerCount: number;
}

/**
 * The centred header every battle wears (its own page, and the featured battle on the home page):
 * a badge, the title, an optional description, and who made it with its size and followers.
 * `titleHref` turns the title into a link; `actions` (follow, share, edit...) sit under the meta row.
 */
export default function BattleHeader({
  battle,
  badge,
  titleHref,
  actions,
}: {
  battle: BattleHeaderData;
  badge: ReactNode;
  titleHref?: string;
  actions?: ReactNode;
}) {
  const titleClass = "text-[28px] font-black leading-[1.35] text-ink sm:text-4xl sm:leading-[1.3]";
  const { creator } = battle;
  return (
    <header className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-4 text-center">
      {badge}
      {titleHref ? (
        <Link href={titleHref} className={`${titleClass} transition hover:text-gold`}>
          {toFaDigits(battle.title)}
        </Link>
      ) : (
        <h1 className={titleClass}>{toFaDigits(battle.title)}</h1>
      )}
      {battle.description && <p className="max-w-xl whitespace-pre-line text-sm leading-7 text-ink-dim">{toFaDigits(battle.description)}</p>}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted">
        {creator && (
          <Link href={`/profile/${encodeURIComponent(creator.username)}`} className="flex items-center gap-2 text-ink-dim transition hover:text-ink">
            {avatarByKey(creator.avatar_key) ? (
              <AuthorAvatar author={{ username: creator.username, avatarKey: creator.avatar_key }} sizeClassName="h-8 w-8" textClassName="text-base" />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-light bg-surface-2 text-sm font-extrabold uppercase text-violet-light"
                aria-hidden="true"
              >
                {creator.username.charAt(0)}
              </span>
            )}
            <span>{creator.display_name || <span dir="ltr">@{creator.username}</span>}</span>
          </Link>
        )}
        {creator && <span className="h-4 w-px bg-border" aria-hidden="true" />}
        <span dir="rtl">{toFaDigits(battle.optionCount)} گزینه</span>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <span dir="rtl">{toFaDigits(battle.followerCount)} دنبال‌کننده</span>
      </div>
      {actions && <div className="mt-1 flex flex-wrap items-center justify-center gap-2 lg:gap-3">{actions}</div>}
    </header>
  );
}
