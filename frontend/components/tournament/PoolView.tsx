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

  const board = battle.leaderboard;
  const playable = battle.status === "active";

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-border px-2.5 py-0.5">{ENTITY_TYPE_LABELS[battle.entity_type]}</span>
          <span className="num">{toFaDigits(battle.bracket_size)} گزینه</span>
          {battle.visibility === "unlisted" && <span>فقط با لینک</span>}
          {battle.status === "archived" && <span>بایگانی‌شده</span>}
        </div>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{battle.title}</h1>
        {battle.description && <p className="max-w-2xl text-sm leading-7 text-muted">{battle.description}</p>}
        <div className="flex flex-wrap items-center gap-4 text-sm text-ink-dim">
          <span className="num">{toFaDigits(battle.total_picks ?? 0)} انتخاب</span>
          <span className="num">{toFaDigits(battle.follower_count)} دنبال‌کننده</span>
          {battle.status !== "draft" && (
            <button type="button" onClick={onToggleFollow} className={`rounded-full border px-4 py-1 ${battle.is_following ? "border-gold text-gold" : "border-border"}`}>
              {battle.is_following ? "دنبال می‌کنی" : "پیگیری نبرد"}
            </button>
          )}
          {battle.status !== "draft" && (
            <ShareMenu url={absoluteUrl(`/battles/${battle.slug}`)} title={`${battle.title} | CinemeGozin`} text={battle.title} size={36} />
          )}
          {battle.status === "draft" && battle.is_owner && (
            <Link href={`/battles/new?slug=${battle.slug}`} className="rounded-full bg-gold px-4 py-1 font-bold text-bg">ادامهٔ ویرایش پیش‌نویس</Link>
          )}
        </div>
      </header>

      {battle.is_owner && <OwnerPanel key={battle.status} battle={battle} onChange={onChange} />}

      {playable ? (
        <section className="mt-10">
          <ThemedRun
            key={run}
            battle={themed}
            signedIn={signedIn}
            onNext={() => setRun((n) => n + 1)}
            custom={{
              onVote,
              reasonText: "هر بار برنده می‌ماند و با گزینهٔ بعدی روبه‌رو می‌شود",
              shareUrl: absoluteUrl(`/battles/${battle.slug}`),
              // The standings unlock once the viewer has played, so read the battle again after a run.
              onDone: reload,
            }}
          />
          {!signedIn && !authLoading && (
            <div className="mt-8 flex flex-col items-center gap-2 text-center">
              <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">ورود</button>
              <p className="text-xs text-muted">برای ثبت انتخاب‌هایت در نتیجهٔ نبرد باید وارد شوی.</p>
            </div>
          )}
        </section>
      ) : (
        battle.status === "draft" && (
          <section className="mt-8 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
            {battle.participants.map((p) => (
              <div key={p.id}><Poster entity={p} size="w185" /></div>
            ))}
          </section>
        )
      )}

      {battle.status !== "draft" && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold text-ink">نتیجهٔ نبرد</h2>
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
                    <span className="num w-28 shrink-0 text-left text-xs text-ink-dim">
                      {row.win_rate === null ? "—" : `${toFaDigits(pct)}٪`} · {toFaDigits(row.wins)}/{toFaDigits(row.played)}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              نتیجهٔ نبرد بعد از اینکه خودت یک دور بازی کنی نمایش داده می‌شود.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
