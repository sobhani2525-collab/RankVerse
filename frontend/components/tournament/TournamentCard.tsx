import Link from "next/link";
import { AuthorAvatar } from "@/components/lists/list-card";
import { avatarByKey } from "@/lib/avatars";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { ENTITY_TYPE_LABELS, STATUS_LABELS, TournamentSummary, tournamentHref } from "@/lib/tournament";
import Poster from "./Poster";
import { SwordsIcon } from "@/components/list-detail/icons";

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

/** One half of the arena: a full-bleed poster cut on a sharp diagonal, its name along the bottom. */
function Half({ entity, side, tone }: { entity?: TournamentSummary["preview"] extends (infer E)[] | undefined ? E : never; side: "start" | "end"; tone: string }) {
  const isStart = side === "start";
  return (
    <div
      className={`absolute inset-y-0 w-[56%] overflow-hidden ${isStart ? "right-0" : "left-0"}`}
      style={{ clipPath: isStart ? "polygon(0 0, 100% 0, 100% 100%, 22% 100%)" : "polygon(0 0, 78% 0, 100% 100%, 0 100%)" }}
    >
      {entity && (
        <div className="h-full w-full transition duration-500 group-hover:scale-105">
          <Poster entity={entity} size="w342" className="!aspect-auto h-full w-full !rounded-none !border-0" />
        </div>
      )}
      <div className={`absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-transparent ${tone}`} />
      {entity && (
        <span className={`absolute bottom-2 line-clamp-1 text-xs font-bold text-ink ${isStart ? "right-3 w-[62%]" : "left-3 w-[62%] text-left"}`}>
          {displayTitle(entity)}
        </span>
      )}
    </div>
  );
}

/**
 * A battle on the hub: two of its entrants squared off under a glowing VS, then who made
 * it and how alive it is (people who played, followers).
 */
export default function TournamentCard({ battle }: { battle: TournamentSummary }) {
  const [a, b] = battle.preview ?? [];
  const creator = battle.creator;

  return (
    <Link
      href={tournamentHref(battle.slug)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-gold/60 bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_12px_40px_-12px_rgba(145,99,245,0.45)]"
    >
      <div className="relative flex flex-col items-center gap-1 px-4 py-4 text-center">
        <h3 className="line-clamp-2 text-lg font-extrabold leading-snug text-ink transition group-hover:text-gold">
          {battle.title}
          <span className="ms-2 whitespace-nowrap rounded-md bg-gold px-2 py-0.5 align-middle text-[11px] font-extrabold text-bg">
            <span className="num">{toFaDigits(battle.bracket_size)}</span> رقیب
          </span>
        </h3>
        {battle.is_official && <span className="text-xs font-bold text-gold">رسمی</span>}
      </div>

      {/* the arena: two posters fill it edge to edge, cut by a sharp diagonal with the clash in the middle */}
      <div className="relative h-64 overflow-hidden border-y border-gold/50 bg-surface-2">
        <Half entity={a} side="start" tone="bg-violet/10" />
        <Half entity={b} side="end" tone="bg-teal/10" />
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_0_6px_rgba(232,179,74,0.9)]" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="43.7" y1="0" x2="56.3" y2="100" stroke="#E8B34A" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <span aria-hidden="true" className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-gold">
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(232,179,74,0.5),transparent_65%)] transition group-hover:scale-125" />
          <SwordsIcon className="relative h-12 w-12 drop-shadow-[0_0_10px_rgba(232,179,74,0.9)] transition duration-300 group-hover:rotate-12 group-hover:scale-110" />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {battle.status === "completed" && battle.winner && (
          <p className="text-sm text-gold">قهرمان: {displayTitle(battle.winner)}</p>
        )}
        {battle.mode === "tournament" && <span className="text-xs text-teal">{STATUS_LABELS[battle.status]}</span>}
        {battle.mode === "pool" && battle.status === "archived" && <span className="text-xs text-muted">{STATUS_LABELS[battle.status]}</span>}

        <div className="mt-auto flex items-center justify-between gap-3">
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
