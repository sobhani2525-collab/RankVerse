"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** One entry of a run's standings: wins this run, and the pick it lost on (later = further). */
interface RunRow {
  entity: TournamentEntity;
  wins: number;
  out: number;
}

/**
 * One result card in the list-page style: a numbered node on a spine, poster and title.
 * The first card is the winner, in gold with a trophy.
 */
function ResultCard({
  entity,
  rank,
  index,
  count,
}: {
  entity: TournamentEntity;
  rank: number;
  index: number;
  count: number;
}) {
  const first = rank === 1;
  return (
    <li className="flex gap-3 sm:gap-4">
      {/* the spine: a numbered node per entry, joined by a line */}
      <div className="relative flex w-14 shrink-0 justify-center sm:w-12">
        <span
          className={`absolute w-px ${first ? "bg-gold/40" : "bg-violet-light/35"} ${index === 0 ? "top-11 sm:top-10" : "top-0"} ${index === count - 1 ? "h-11 sm:h-10" : "bottom-0"}`}
          aria-hidden="true"
        />
        <span
          className={`num relative z-10 mt-4 flex h-14 w-14 items-center justify-center rounded-full border-2 text-lg font-extrabold sm:h-12 sm:w-12 sm:text-base ${
            first ? "border-gold bg-gold text-bg shadow-[0_0_0_5px_rgba(232,179,74,0.2)]" : "border-violet-light/60 bg-bg text-violet-light"
          }`}
        >
          {toFaDigits(rank)}
        </span>
      </div>

      <div
        className={`mb-4 flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:p-5 ${
          first ? "border-gold/50 bg-gradient-to-br from-gold/[0.10] via-surface to-surface shadow-[0_0_0_1px_rgba(232,179,74,0.12)]" : "border-border bg-surface"
        }`}
      >
        <EntityLink entity={entity} className="block w-full shrink-0 self-start transition hover:brightness-110 sm:w-auto">
          <Poster entity={entity} size="w342" className={`w-full sm:w-28 ${first ? "!border-gold/60" : ""}`} />
        </EntityLink>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {first && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-mono tracking-widest text-gold">WINNER</span>
              <span className="text-muted">برنده نبرد</span>
            </div>
          )}
          <EntityLink entity={entity} className="flex items-start gap-2.5 transition hover:brightness-110">
            {first && <TrophyIcon className="mt-1 h-8 w-8 shrink-0 text-gold sm:h-9 sm:w-9" />}
            <span className="min-w-0">
              <span className={`block text-xl font-black leading-snug sm:text-2xl ${first ? "text-gold" : "text-ink"}`}>
                {entity.title_fa || entity.title}
              </span>
              {entity.title_fa && (
                <span className="block text-right text-sm text-ink-dim" dir="ltr">
                  {entity.title}
                </span>
              )}
            </span>
          </EntityLink>
          {entity.year ? (
            <span
              className={`num mt-1 inline-flex w-fit rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-bold text-ink-dim ${
                first ? "mr-[42px] sm:mr-[46px]" : ""
              }`}
            >
              {toFaDigits(entity.year)}
            </span>
          ) : null}
        </div>

      </div>
    </li>
  );
}

/** The viewer's own run: its champion, then whoever won most and lasted longest. */
function MyResults({ rows }: { rows: RunRow[] }) {
  const top = rows.slice(0, TOP_COUNT);
  return (
    <section className="rv-rise mx-auto max-w-3xl">
      <SectionHeading en="YOUR RESULT" fa="نتیجهٔ نبرد تو" />
      <p className="mb-5 mt-1 text-xs text-muted">رتبه بر اساس تعداد برد در همین نبرد</p>
      <ol>
        {top.map((row, i) => (
          <ResultCard
            key={row.entity.id}
            entity={row.entity}
            rank={i + 1}
            index={i}
            count={top.length}
          />
        ))}
      </ol>
    </section>
  );
}

/**
 * Everyone's picks as one compact bar per entry, by win rate. It answers "do others agree
 * with me?", so the viewer's champion is marked and its place is said up front.
 */
function CommunityResults({ battle, mine }: { battle: TournamentDetail; mine: string | null }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const board = battle.leaderboard ?? null;
  const myRow = mine ? board?.find((r) => r.entity_id === mine) : undefined;

  return (
    <section className="mx-auto mt-10 max-w-3xl">
      <SectionHeading en="EVERYONE" fa="نظر جمع" />
      {board ? (
        <>
          <p className="mb-4 mt-1 text-xs text-muted">
            نرخ پیروزی هر گزینه در {toFaDigits(battle.total_picks ?? 0)} انتخاب همهٔ کاربران
          </p>
          {myRow && (
            <p className="mb-4 rounded-xl border border-teal/40 bg-teal/[0.06] px-4 py-3 text-sm text-ink">
              <span className="font-bold text-teal">{myRow.entity.title_fa || myRow.entity.title}</span>،{" "}
              {myRow.rank === 1 ? (
                "برندهٔ جمع هم هست."
              ) : (
                <>
                  در نظر جمع رتبهٔ <span className="num font-bold">{toFaDigits(myRow.rank)}</span> را دارد.
                </>
              )}
            </p>
          )}
          <ol className="flex flex-col gap-2">
            {board.map((row) => {
              const pct = row.win_rate === null ? 0 : Math.round(row.win_rate * 100);
              const isMine = row.entity_id === mine;
              const first = row.rank === 1;
              return (
                <li key={row.entity_id} className="flex items-center gap-3 text-sm">
                  <span className={`num w-6 shrink-0 text-center font-bold ${first ? "text-gold" : "text-muted"}`}>{toFaDigits(row.rank)}</span>
                  <div className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-lg bg-surface2">
                    <div
                      className={`absolute inset-y-0 start-0 rounded-lg ${isMine ? "bg-teal/35" : first ? "bg-gold/30" : "bg-violet-light/20"}`}
                      style={{ width: `${pct}%` }}
                      aria-hidden="true"
                    />
                    <EntityLink
                      entity={row.entity}
                      className={`relative flex h-full items-center px-3 transition hover:brightness-110 ${isMine ? "font-bold text-teal" : "text-ink"}`}
                    >
                      <span className="truncate">{row.entity.title_fa || row.entity.title}</span>
                      {isMine && <span className="ms-2 shrink-0 text-[11px] font-normal">· برنده نبرد تو</span>}
                    </EntityLink>
                  </div>
                  <span className="num w-12 shrink-0 text-end font-bold text-ink-dim">
                    {row.win_rate === null ? "—" : `${toFaDigits(pct)}٪`}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      ) : !authLoading && !isAuthenticated ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          برای دیدن نظر جمع باید وارد شوی.
          <div className="mt-3">
            <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">ورود</button>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">در حال بارگذاری نظر جمع…</p>
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
  const router = useRouter();
  const [runDone, setRunDone] = useState(false);
  const [myChampion, setMyChampion] = useState<string | null>(null);
  // This run's tally, kept in a ref so recording a pick doesn't re-render the run.
  const tally = useRef<Map<string, { wins: number; out: number }>>(new Map());
  const pickCount = useRef(0);
  const [myRows, setMyRows] = useState<RunRow[]>([]);
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
    // Shuffled once per visit, not on every poll/refresh of the battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [battle.slug, battle.participants.length]
  );

  const onPick = useCallback((championId: string, challengerId: string, winner: Side) => {
    const [won, lost] = winner === "left" ? [championId, challengerId] : [challengerId, championId];
    pickCount.current += 1;
    const t = tally.current;
    const w = t.get(won) ?? { wins: 0, out: 0 };
    t.set(won, { ...w, wins: w.wins + 1 });
    const l = t.get(lost) ?? { wins: 0, out: 0 };
    t.set(lost, { ...l, out: pickCount.current });
  }, []);

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
    const byId = new Map(battle.participants.map((p) => [p.id, p]));
    const rows: RunRow[] = [];
    tally.current.forEach((v, id) => {
      const entity = byId.get(id);
      if (entity) rows.push({ entity, wins: v.wins, out: v.out });
    });
    // The champion first; then more wins, then knocked out later.
    rows.sort((x, y) =>
      x.entity.id === championId ? -1 : y.entity.id === championId ? 1 : y.wins - x.wins || y.out - x.out
    );
    setMyRows(rows);
    setMyChampion(championId);
    setRunDone(true);
    reload();
  }, [reload, battle.participants]);

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
          {showResults && myRows.length > 0 && <MyResults rows={myRows} />}
          <div className={showResults ? "mt-2" : ""}>
            <ThemedRun
              battle={themed}
              signedIn={signedIn}
              onNext={() => router.push("/battles")}
              custom={{
                onVote,
                onPick,
                reasonText: "هر بار برنده می‌ماند و با گزینهٔ بعدی روبه‌رو می‌شود",
                storyBattleName: battle.title,
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
          {showResults && <CommunityResults battle={battle} mine={myChampion} />}
        </section>
      ) : battle.status === "draft" ? (
        <section className="mt-8 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
          {battle.participants.map((p) => (
            <div key={p.id}><Poster entity={p} size="w185" /></div>
          ))}
        </section>
      ) : (
        <section className="mt-12 max-w-2xl">
          <CommunityResults battle={battle} mine={null} />
        </section>
      )}
    </main>
  );
}
