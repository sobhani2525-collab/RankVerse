import Link from "next/link";
import { AuthorAvatar } from "@/components/lists/list-card";
import { avatarByKey } from "@/lib/avatars";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { ENTITY_TYPE_LABELS, STATUS_LABELS, TournamentSummary, tournamentHref } from "@/lib/tournament";
import Poster from "./Poster";

function PeopleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14c1.8.6 3 2.2 3 5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * A battle on the hub: two of its entrants squared off under a glowing VS, then who made
 * it and how alive it is (people who played, followers).
 */
export default function TournamentCard({ battle }: { battle: TournamentSummary }) {
  const [a, b] = battle.preview ?? [];
  const more = Math.max(battle.bracket_size - 2, 0);
  const creator = battle.creator;

  return (
    <Link
      href={tournamentHref(battle.slug)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_12px_40px_-12px_rgba(145,99,245,0.45)]"
    >
      {/* the arena */}
      <div className="relative h-56 overflow-hidden bg-[radial-gradient(ellipse_at_50%_55%,rgba(145,99,245,0.30),transparent_68%)]">
        <div className="absolute inset-0 bg-gradient-to-b from-violet/[0.06] via-transparent to-surface" aria-hidden="true" />
        {a && (
          <div className="absolute right-[13%] top-6 w-[33%] -rotate-6 transition duration-300 group-hover:-rotate-3 group-hover:scale-[1.03]">
            <Poster entity={a} size="w342" className="!border-violet-light/70 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]" />
          </div>
        )}
        {b && (
          <div className="absolute left-[13%] top-6 w-[33%] rotate-6 transition duration-300 group-hover:rotate-3 group-hover:scale-[1.03]">
            <Poster entity={b} size="w342" className="!border-violet-light/70 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]" />
          </div>
        )}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[44%] z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-[#05070D] font-mono text-xs font-bold tracking-widest text-violet-light shadow-[0_0_0_5px_rgba(5,7,13,0.9),0_0_30px_rgba(145,99,245,0.6)] transition group-hover:scale-110"
        >
          VS
        </span>
        {more > 0 && (
          <span className="absolute inset-x-0 bottom-3 text-center text-xs text-ink-dim">
            و <span className="num font-bold text-gold">{toFaDigits(more)}</span> رقیب دیگر
          </span>
        )}
        <span className="absolute start-3 top-3 rounded-full border border-border bg-bg/80 px-2.5 py-0.5 text-[11px] text-muted backdrop-blur">
          {ENTITY_TYPE_LABELS[battle.entity_type]}
        </span>
        {battle.is_official && <span className="absolute end-3 top-3 text-xs font-bold text-gold">رسمی</span>}
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-1">
        <h3 className="line-clamp-2 min-h-[3rem] text-base font-extrabold leading-snug text-ink transition group-hover:text-gold">
          {battle.title}
        </h3>
        {battle.status === "completed" && battle.winner && (
          <p className="text-sm text-gold">قهرمان: {displayTitle(battle.winner)}</p>
        )}
        {battle.mode === "tournament" && <span className="text-xs text-teal">{STATUS_LABELS[battle.status]}</span>}
        {battle.mode === "pool" && battle.status === "archived" && <span className="text-xs text-muted">{STATUS_LABELS[battle.status]}</span>}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-soft pt-3">
          {creator ? (
            <span className="flex min-w-0 items-center gap-2">
              {avatarByKey(creator.avatar_key) ? (
                <AuthorAvatar
                  author={{ username: creator.username, avatarKey: creator.avatar_key }}
                  sizeClassName="h-7 w-7"
                  textClassName="text-sm"
                />
              ) : (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-light bg-surface-2 text-xs font-extrabold uppercase text-violet-light"
                  aria-hidden="true"
                >
                  {creator.username.charAt(0)}
                </span>
              )}
              <span className="min-w-0 truncate text-xs text-ink-dim">
                {creator.display_name || <span dir="ltr">@{creator.username}</span>}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1" title="مشارکت‌کننده">
              <PeopleIcon />
              <span className="num">{toFaDigits(battle.players_count ?? 0)}</span>
            </span>
            <span className="flex items-center gap-1" title="دنبال‌کننده">
              <BellIcon />
              <span className="num">{toFaDigits(battle.follower_count ?? 0)}</span>
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
