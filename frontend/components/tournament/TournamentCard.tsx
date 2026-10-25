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

function TrophyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" />
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
        <div className="h-full w-full">
          <Poster entity={entity} size="w342" className="!aspect-auto h-full w-full !rounded-none !border-0" />
        </div>
      )}
      <div className={`absolute inset-0 mix-blend-soft-light ${tone}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/20 to-transparent" />
      {entity && (
        <span
          className={`absolute bottom-3 line-clamp-2 w-[58%] text-[13px] font-bold leading-5 text-ink [text-shadow:0_1px_8px_rgba(0,0,0,0.8)] ${isStart ? "right-3.5" : "left-3.5 text-left"}`}
        >
          {displayTitle(entity)}
        </span>
      )}
    </div>
  );
}

/**
 * A battle on the hub: two of its entrants squared off on either side of a gold diagonal,
 * the battle's name under them, then who made it and how alive it is (players, followers).
 */
export default function TournamentCard({ battle }: { battle: TournamentSummary }) {
  const [a, b] = battle.preview ?? [];
  const creator = battle.creator;
  const showStatus = battle.mode === "tournament" || (battle.mode === "pool" && battle.status === "archived");
  const winner = battle.status === "completed" ? battle.winner : null;

  return (
    <Link
      href={tournamentHref(battle.slug)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition duration-300 hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70"
    >
      {/* the arena: two posters fill it edge to edge, cut by a sharp diagonal with the clash in the middle */}
      <div className="relative aspect-[16/11] overflow-hidden bg-surface-2">
        <Half entity={a} side="start" tone="bg-violet/25" />
        <Half entity={b} side="end" tone="bg-teal/25" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-bg/70 to-transparent" />
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_0_5px_rgba(232,179,74,0.8)]" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="43.7" y1="0" x2="56.3" y2="100" stroke="#E8B34A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>

        <span aria-hidden="true" className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(232,179,74,0.35),transparent_65%)] transition duration-300 ease-out group-hover:scale-150" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-gold/70 bg-bg/80 text-gold shadow-[0_0_0_4px_rgba(11,15,26,0.45),0_0_18px_rgba(232,179,74,0.45)] backdrop-blur-sm transition duration-300 ease-out group-hover:scale-125">
            <SwordsIcon className="h-6 w-6" />
          </span>
        </span>

        <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-bg/60 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur-md">
            <span className="num text-gold">{toFaDigits(battle.bracket_size)}</span> رقیب
          </span>
          {battle.is_official && (
            <span className="rounded-full bg-gold px-2.5 py-1 text-[11px] font-extrabold text-bg shadow-[0_2px_10px_rgba(232,179,74,0.4)]">
              رسمی
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-3 pt-3.5">
        <h3 className="line-clamp-2 text-base font-extrabold leading-7 text-ink transition-colors group-hover:text-gold">
          {toFaDigits(battle.title)}
        </h3>

        {(winner || showStatus) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {winner && (
              <span className="flex min-w-0 items-center gap-1 font-bold text-gold">
                <TrophyIcon />
                <span className="truncate">{displayTitle(winner)}</span>
              </span>
            )}
            {showStatus && (
              <span className={`flex items-center gap-1.5 ${battle.status === "active" ? "text-teal" : "text-muted"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${battle.status === "active" ? "animate-pulse bg-teal" : "bg-muted"}`} />
                {STATUS_LABELS[battle.status]}
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
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
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1" title="مشارکت‌کننده">
              <PeopleIcon />
              <span className="num">{toFaDigits(battle.players_count ?? 0)}</span>
            </span>
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1" title="دنبال‌کننده">
              <BellIcon />
              <span className="num">{toFaDigits(battle.follower_count ?? 0)}</span>
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
