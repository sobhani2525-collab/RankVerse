"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toFaDigits } from "@/lib/format-number";
import { absoluteUrl } from "@/lib/site";
import ShareMenu from "@/components/share/ShareMenu";
import { AuthorAvatar } from "@/components/lists/list-card";
import { avatarByKey } from "@/lib/avatars";
import { Side, ThemedRun } from "@/components/home/BattleArena";
import type { ThemedBattle, ThemedBattleItem } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";
import { SectionHeading } from "@/components/list-detail/ui";
import { TournamentDetail, TournamentEntity, tournamentApi } from "@/lib/tournament";
import OwnerPanel from "./OwnerPanel";
import Poster from "./Poster";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const TOP_COUNT = 4;

function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 14v3.5M8.5 20h7M9.5 17.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function EntityLink({ entity, className, children }: { entity: TournamentEntity; className?: string; children: React.ReactNode }) {
  const href = detailPathFor(entity.entity_type, entity.slug);
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

/**
 * The battle's result, merged with its winner: the top entries by win rate as cards in the
 * list-page style, the first (the winner) in gold with a trophy. `mine` marks the entry the
 * viewer's own run ended on.
 */
function Results({ battle, mine }: { battle: TournamentDetail; mine: string | null }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const board = battle.leaderboard?.slice(0, TOP_COUNT) ?? null;

  return (
    <section className="rv-rise mx-auto max-w-3xl">
      <SectionHeading en="RESULTS" fa="نتیجهٔ نبرد" />
      {board ? (
        <>
          <p className="mb-5 mt-1 text-xs text-muted">
            {toFaDigits(Math.min(TOP_COUNT, board.length))} گزینهٔ برتر از {toFaDigits(battle.total_picks ?? 0)} انتخاب · رتبه با درنظرگرفتن تعداد انتخاب‌ها
          </p>
          <ol>
            {board.map((row, i) => {
              const pct = row.win_rate === null ? 0 : Math.round(row.win_rate * 100);
              const first = row.rank === 1;
              const kind = row.entity.entity_type === "tv_series" ? "سریال" : "فیلم";
              return (
                <li key={row.entity_id} className="flex gap-3 sm:gap-4">
                  {/* the spine: a numbered node per entry, joined by a line */}
                  <div className="relative flex w-14 shrink-0 justify-center sm:w-12">
                    <span
                      className={`absolute w-px ${first ? "bg-gold/40" : "bg-violet-light/35"} ${i === 0 ? "top-11 sm:top-10" : "top-0"} ${i === board.length - 1 ? "h-11 sm:h-10" : "bottom-0"}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`num relative z-10 mt-4 flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-extrabold sm:h-12 sm:w-12 sm:text-base ${
                        first
                          ? "border-gold bg-gold text-bg shadow-[0_0_0_5px_rgba(232,179,74,0.2)]"
                          : "border-violet-light/60 bg-bg text-violet-light"
                      }`}
                    >
                      {toFaDigits(row.rank)}
                    </span>
                  </div>

                  <div
                    className={`mb-4 flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:p-5 ${
                      first
                        ? "border-gold/50 bg-gradient-to-br from-gold/[0.10] via-surface to-surface shadow-[0_0_0_1px_rgba(232,179,74,0.12)]"
                        : mine === row.entity_id
                          ? "border-teal/60 bg-gradient-to-br from-teal/[0.08] via-surface to-surface shadow-[0_0_0_1px_rgba(79,184,166,0.15)]"
                          : "border-border bg-surface"
                    }`}
                  >
                    <EntityLink entity={row.entity} className="block w-full shrink-0 self-start transition hover:brightness-110 sm:w-auto">
                      <Poster entity={row.entity} size="w342" className={`w-full sm:w-28 ${first ? "!border-gold/60" : ""}`} />
                    </EntityLink>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={`font-mono tracking-widest ${first ? "text-gold" : "text-dim"}`}>
                          {first ? "WINNER" : row.entity.entity_type === "tv_series" ? "SERIES" : "MOVIE"}
                        </span>
                        <span className="text-muted">{first ? "برندهٔ نبرد" : kind}</span>
                        {mine === row.entity_id && (
                          <span className="rounded-full border border-teal/50 bg-teal/10 px-2 py-0.5 text-teal">انتخاب تو</span>
                        )}
                      </div>
                      <EntityLink entity={row.entity} className="flex items-start gap-2.5 transition hover:brightness-110">
                        {first && <TrophyIcon className="mt-1 h-8 w-8 shrink-0 text-gold sm:h-9 sm:w-9" />}
                        <span className="min-w-0">
                          <span className={`block text-xl font-black leading-snug sm:text-2xl ${first ? "text-gold" : "text-ink"}`}>
                            {row.entity.title_fa || row.entity.title}
                          </span>
                          {row.entity.title_fa && (
                            <span className="block text-right text-sm text-ink-dim" dir="ltr">
                              {row.entity.title}
                            </span>
                          )}
                        </span>
                      </EntityLink>
                      {row.entity.year ? (
                        <span
                          className={`num mt-1 inline-flex w-fit rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-bold text-ink-dim ${
                            first ? "ms-[42px] sm:ms-[46px]" : ""
                          }`}
                        >
                          {toFaDigits(row.entity.year)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-4 border-t border-border pt-3 sm:w-28 sm:flex-col sm:items-start sm:justify-center sm:gap-1 sm:border-s sm:border-t-0 sm:ps-5 sm:pt-0">
                      <span className="font-mono text-[11px] tracking-widest text-dim">WIN RATE</span>
                      <span className={`num text-3xl font-black leading-none ${first ? "text-gold" : "text-ink"}`}>
                        {row.win_rate === null ? "—" : `${toFaDigits(pct)}٪`}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : !authLoading && !isAuthenticated ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          برای ثبت انتخاب‌هایت و دیدن نتیجهٔ جمعی باید وارد شوی.
          <div className="mt-3">
            <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">ورود</button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">در حال بارگذاری نتیجه…</p>
      )}
    </section>
  );
}

/** A pool battle page: play the creator's pool "winner stays" style, then see the standings. */
export default function PoolView({
  battle,
  onChange,
  onToggleFollow,
  reload,
}: {
  battle: TournamentDetail;
  onChange: (b: TournamentDetail) => void;
  onToggleFollow: () => void;
  reload: () => void;
}) {
  const { getToken, isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const [run, setRun] = useState(0); // a new value reshuffles the pool for another run
  const [runDone, setRunDone] = useState(false);
  const [myChampion, setMyChampion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const signedIn = !authLoading && isAuthenticated;

  const themed: ThemedBattle = useMemo(
    () => ({
      category: battle.entity_type,
      theme: { kind: "pair", value: battle.title, personalized: false },
      items: shuffled(battle.participants).map<ThemedBattleItem>((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        title_fa: p.title_fa,
        entity_type: p.entity_type,
        poster_path: p.poster_url?.startsWith("/") ? p.poster_url : null,
        year: p.year ?? null,
        computed_score: null,
      })),
    }),
    // The pool is reshuffled only for a new run, not on every poll/refresh of the battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [battle.slug, battle.participants.length, run]
  );

  const onVote = useCallback(
    async (championId: string, challengerId: string, winner: Side) => {
      const token = getToken();
      if (!token) return;
      await tournamentApi.pick(token, battle.slug, {
        champion_id: championId,
        challenger_id: challengerId,
        winner_id: winner === "left" ? championId : challengerId,
      });
    },
    [getToken, battle.slug]
  );

  // The standings unlock once the viewer has played, so read the battle again after a run.
  const handleDone = useCallback((championId: string) => {
    setMyChampion(championId);
    setRunDone(true);
    reload();
  }, [reload]);

  const playable = battle.status === "active";
  const showResults = playable ? runDone : battle.status !== "draft";

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-col gap-4 lg:gap-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Link href="/battles" className="rounded-full border border-border px-2.5 py-0.5 transition hover:border-gold/40 hover:text-gold">
            نبردهای کاربران
          </Link>
          {battle.status === "archived" && <span>بایگانی‌شده</span>}
        </div>
        <h1 className="text-[30px] font-black leading-[1.35] text-ink lg:text-[56px] lg:leading-[1.2]">{battle.title}</h1>
        {battle.description && (
          <p className="max-w-[720px] whitespace-pre-line text-[15px] leading-[1.9] text-ink-dim lg:text-lg">{battle.description}</p>
        )}

        {battle.creator && (
          <div className="flex items-center gap-3.5">
            <Link
              href={`/profile/${encodeURIComponent(battle.creator.username)}`}
              className="flex min-h-[44px] items-center gap-2.5 text-ink lg:gap-3"
            >
              {avatarByKey(battle.creator.avatar_key) ? (
                <AuthorAvatar
                  author={{ username: battle.creator.username, avatarKey: battle.creator.avatar_key }}
                  sizeClassName="h-10 w-10 lg:h-11 lg:w-11"
                  textClassName="text-xl"
                />
              ) : (
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-light bg-surface-2 font-extrabold uppercase text-violet-light lg:h-11 lg:w-11"
                  aria-hidden="true"
                >
                  {battle.creator.username.charAt(0)}
                </span>
              )}
              <span className="flex flex-col">
                <span className="text-sm font-bold lg:text-[15px]">
                  {battle.creator.display_name || <span dir="ltr">@{battle.creator.username}</span>}
                </span>
                <span className="text-xs text-muted lg:text-[13px]">سازنده نبرد</span>
              </span>
            </Link>
            <span className="h-7 w-px bg-border" aria-hidden="true" />
            <span className="text-xs text-dim lg:text-[13px]" dir="rtl">
              {toFaDigits(battle.follower_count)} دنبال‌کننده
            </span>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2 lg:gap-3">
          {battle.status !== "draft" && (
            <button
              type="button"
              onClick={onToggleFollow}
              aria-pressed={battle.is_following}
              className={`h-12 flex-1 rounded-xl px-[26px] text-[15px] font-extrabold transition lg:flex-none ${
                battle.is_following ? "border border-teal/50 bg-teal/10 text-teal" : "bg-ink text-bg hover:bg-ink/90"
              }`}
            >
              {battle.is_following ? "دنبال می‌کنید" : "دنبال کردن"}
            </button>
          )}
          {battle.status !== "draft" && (
            <ShareMenu
              url={absoluteUrl(`/battles/${battle.slug}`)}
              title={`${battle.title} | CinemeGozin`}
              text={battle.title}
              size={48}
              shape="square"
            />
          )}
          {battle.is_owner && battle.status !== "draft" && battle.status !== "archived" && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="h-12 rounded-xl border border-border bg-surface px-4 text-sm text-muted transition hover:border-gold/40 hover:text-gold"
            >
              {editing ? "بستن ویرایش" : "ویرایش نبرد"}
            </button>
          )}
          {battle.status === "draft" && battle.is_owner && (
            <Link href={`/battles/new?slug=${battle.slug}`} className="flex h-12 items-center rounded-xl bg-gold px-5 font-bold text-bg">
              ادامهٔ ویرایش پیش‌نویس
            </Link>
          )}
        </div>
      </header>

      {battle.is_owner && editing && <OwnerPanel key={battle.status} battle={battle} onChange={onChange} />}

      {playable ? (
        <section className="mt-10">
          {showResults && <Results battle={battle} mine={myChampion} />}
          <div className={showResults ? "mt-2" : ""}>
            <ThemedRun
              key={run}
              battle={themed}
              signedIn={signedIn}
              onNext={() => {
                setRunDone(false);
                setRun((n) => n + 1);
              }}
              custom={{
                onVote,
                reasonText: "هر بار برنده می‌ماند و با گزینهٔ بعدی روبه‌رو می‌شود",
                shareUrl: absoluteUrl(`/battles/${battle.slug}`),
                onDone: handleDone,
                compactDone: true,
              }}
            />
            {!signedIn && !authLoading && !runDone && (
              <div className="mt-8 flex flex-col items-center gap-2 text-center">
                <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">ورود</button>
                <p className="text-xs text-muted">برای ثبت انتخاب‌هایت در نتیجهٔ نبرد باید وارد شوی.</p>
              </div>
            )}
          </div>
        </section>
      ) : battle.status === "draft" ? (
        <section className="mt-8 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
          {battle.participants.map((p) => (
            <div key={p.id}><Poster entity={p} size="w185" /></div>
          ))}
        </section>
      ) : (
        <section className="mt-12 max-w-2xl">
          <Results battle={battle} mine={null} />
        </section>
      )}
    </main>
  );
}
