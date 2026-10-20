"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { absoluteUrl } from "@/lib/site";
import ShareMenu from "@/components/share/ShareMenu";
import { Side, ThemedRun } from "@/components/home/BattleArena";
import type { ThemedBattle, ThemedBattleItem } from "@/lib/types";
import { ENTITY_TYPE_LABELS, TournamentDetail, tournamentApi } from "@/lib/tournament";
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

function Standings({ battle }: { battle: TournamentDetail }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const board = battle.leaderboard;

  return (
    <div>
      <h2 className="mb-4 text-lg font-extrabold text-ink lg:text-[22px]">نتیجهٔ نبرد</h2>
      {board ? (
        <ol className="flex flex-col gap-2">
          {board.map((row) => {
            const pct = row.win_rate === null ? 0 : Math.round(row.win_rate * 100);
            return (
              <li key={row.entity_id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2">
                <span className={`num w-7 text-center text-sm ${row.rank === 1 ? "text-gold" : "text-muted"}`}>{toFaDigits(row.rank)}</span>
                <Poster entity={row.entity} size="w185" className="w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{displayTitle(row.entity)}</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div className={`h-full ${row.rank === 1 ? "bg-gold" : "bg-teal"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="num w-24 shrink-0 text-left text-xs text-ink-dim">
                  {row.win_rate === null ? "—" : `${toFaDigits(pct)}٪`} · {toFaDigits(row.wins)}/{toFaDigits(row.played)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : !authLoading && !isAuthenticated ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          برای ثبت انتخاب‌هایت و دیدن نتیجهٔ جمعی باید وارد شوی.
          <div className="mt-3">
            <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">ورود</button>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">در حال بارگذاری نتیجه…</p>
      )}
    </div>
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
        year: null,
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
  const handleDone = useCallback(() => {
    setRunDone(true);
    reload();
  }, [reload]);

  const playable = battle.status === "active";
  const showResults = playable ? runDone : battle.status !== "draft";

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-col gap-4 lg:gap-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-border px-2.5 py-0.5">{ENTITY_TYPE_LABELS[battle.entity_type]}</span>
          <span dir="rtl">{toFaDigits(battle.bracket_size)} گزینه</span>
          <span dir="rtl">{toFaDigits(battle.follower_count)} دنبال‌کننده</span>
          {battle.status === "archived" && <span>بایگانی‌شده</span>}
        </div>
        <h1 className="text-[30px] font-black leading-[1.35] text-ink lg:text-[56px] lg:leading-[1.2]">{battle.title}</h1>
        {battle.description && (
          <p className="max-w-[720px] whitespace-pre-line text-[15px] leading-[1.9] text-ink-dim lg:text-lg">{battle.description}</p>
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
        <section className="mt-10 flex flex-col md:flex-row md:items-start">
          {/* RTL: the run (first child) sits on the right; when it ends it slides over and the standings open on the left. */}
          <div className={`min-w-0 transition-all duration-700 ease-in-out ${showResults ? "md:w-1/2" : "md:w-full"}`}>
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
              }}
            />
            {!signedIn && !authLoading && !runDone && (
              <div className="mt-8 flex flex-col items-center gap-2 text-center">
                <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">ورود</button>
                <p className="text-xs text-muted">برای ثبت انتخاب‌هایت در نتیجهٔ نبرد باید وارد شوی.</p>
              </div>
            )}
          </div>
          <div
            className={`min-w-0 overflow-hidden transition-all duration-700 ease-in-out ${
              showResults
                ? "mt-10 max-h-[3000px] opacity-100 md:mt-0 md:w-1/2 md:pe-0 md:ps-8"
                : "max-h-0 opacity-0 md:w-0"
            }`}
            aria-hidden={!showResults}
          >
            <div className="md:min-w-[22rem]">{showResults && <Standings battle={battle} />}</div>
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
          <Standings battle={battle} />
        </section>
      )}
    </main>
  );
}
