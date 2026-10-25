"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import {
  ENTITY_TYPE_LABELS,
  STATUS_LABELS,
  TournamentApiError,
  TournamentDetail,
  TournamentEntity,
  TournamentMatch,
  remainingFa,
  roundLabel,
  tournamentApi,
} from "@/lib/tournament";
import ShareMenu from "@/components/share/ShareMenu";
import { absoluteUrl } from "@/lib/site";
import OwnerPanel from "./OwnerPanel";
import PoolView from "./PoolView";
import Poster from "./Poster";
import CardTitle from "@/components/entities/card-title";

const POLL_MS = 30_000;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function Side({
  entity,
  votes,
  total,
  chosen,
  winner,
  canVote,
  pending,
  onPick,
}: {
  entity: TournamentEntity | null;
  votes: number | null;
  total: number;
  chosen: boolean;
  winner: boolean;
  canVote: boolean;
  pending: boolean;
  onPick: () => void;
}) {
  if (!entity) {
    return <div className="flex-1 rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">در انتظار برنده</div>;
  }
  const pct = votes !== null && total > 0 ? Math.round((votes / total) * 100) : null;
  return (
    <button
      type="button"
      disabled={!canVote || pending}
      onClick={onPick}
      className={`relative flex flex-1 flex-col gap-2 overflow-hidden rounded-xl border p-2 text-right transition ${
        winner ? "border-gold bg-gold/10" : chosen ? "border-teal bg-teal/10" : "border-border bg-surface"
      } ${canVote ? "hover:border-gold/60" : "cursor-default"}`}
    >
      <Poster entity={entity} size="w185" />
      <span className="min-h-[2.5rem] min-w-0 text-sm text-ink">
        <CardTitle entity={entity} className="line-clamp-2" />
      </span>
      {pct !== null && (
        <span className="num text-xs text-ink-dim">
          {toFaDigits(pct)}٪ · {toFaDigits(votes ?? 0)} رأی
        </span>
      )}
      {chosen && <span className="absolute left-2 top-2 rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-bg">رأی تو</span>}
      {winner && <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-bg">برنده</span>}
    </button>
  );
}

function MatchCard({
  match,
  isCurrent,
  active,
  pendingId,
  onVote,
}: {
  match: TournamentMatch;
  isCurrent: boolean;
  active: boolean;
  pendingId: string | null;
  onVote: (entityId: string) => void;
}) {
  const canVote = active && isCurrent && match.status === "open" && !!match.entity_a && !!match.entity_b;
  const total = (match.votes_a ?? 0) + (match.votes_b ?? 0);
  const pending = pendingId === match.id;
  return (
    <div className="flex gap-2 rounded-2xl border border-border bg-surface2 p-2">
      <Side
        entity={match.entity_a}
        votes={match.votes_a}
        total={total}
        chosen={!!match.entity_a && match.my_vote === match.entity_a.id}
        winner={!!match.entity_a && match.winner_entity_id === match.entity_a.id}
        canVote={canVote}
        pending={pending}
        onPick={() => match.entity_a && onVote(match.entity_a.id)}
      />
      <span className="self-center text-xs text-muted">VS</span>
      <Side
        entity={match.entity_b}
        votes={match.votes_b}
        total={total}
        chosen={!!match.entity_b && match.my_vote === match.entity_b.id}
        winner={!!match.entity_b && match.winner_entity_id === match.entity_b.id}
        canVote={canVote}
        pending={pending}
        onPick={() => match.entity_b && onVote(match.entity_b.id)}
      />
    </div>
  );
}

/** The battle page: full bracket, countdown, live-ish votes (30s polling while active). */
export default function TournamentView({ slug }: { slug: string }) {
  const { getToken, isAuthenticated, loading: authLoading } = useAuth();
  const { requireAuth } = useAuthGate();
  const [battle, setBattle] = useState<TournamentDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [pendingMatch, setPendingMatch] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [shown, setShown] = useState(0); // round tab on narrow screens
  const refetchedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await tournamentApi.get(slug, getToken());
      setBattle(data);
      setError(null);
    } catch (err) {
      const status = err instanceof TournamentApiError ? err.status : 0;
      // authFetch throws a plain Error; a missing/private battle reads as 404 text-wise.
      setError({ status, message: err instanceof Error ? err.message : "خطا" });
    }
  }, [slug, getToken]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, isAuthenticated, load]);

  const active = battle?.status === "active";
  useEffect(() => {
    if (!active) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [active, load]);

  const now = useNow(!!active);
  const deadline = battle?.current_round_closes_at ?? null;
  const remaining = deadline ? remainingFa(deadline, now) : null;
  // The moment the countdown ends, fetch once: the read itself advances the round.
  useEffect(() => {
    if (active && deadline && !remaining && refetchedFor.current !== deadline) {
      refetchedFor.current = deadline;
      load();
    }
  }, [active, deadline, remaining, load]);

  useEffect(() => {
    if (battle) setShown(Math.max(battle.current_round - 1, 0));
  }, [battle?.current_round, battle?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function vote(match: TournamentMatch, entityId: string) {
    requireAuth(async () => {
      const token = getToken();
      if (!token || !battle) return;
      setVoteError(null);
      const before = battle;
      // Optimistic: mark the choice immediately; counts arrive with the response.
      setBattle({
        ...battle,
        rounds: battle.rounds.map((r) => ({
          ...r,
          matches: r.matches.map((m) => (m.id === match.id ? { ...m, my_vote: entityId } : m)),
        })),
      });
      setPendingMatch(match.id);
      try {
        setBattle(await tournamentApi.vote(token, slug, match.id, entityId));
      } catch (err) {
        setBattle(before);
        setVoteError(err instanceof Error ? err.message : "ثبت رأی ناموفق بود");
        load();
      } finally {
        setPendingMatch(null);
      }
    });
  }

  function toggleFollow() {
    requireAuth(async () => {
      const token = getToken();
      if (!token || !battle) return;
      const next = !battle.is_following;
      setBattle({ ...battle, is_following: next, follower_count: battle.follower_count + (next ? 1 : -1) });
      try {
        await tournamentApi.follow(token, slug, next);
      } catch {
        load();
      }
    });
  }

  if (error && !battle) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-lg text-ink">این نبرد پیدا نشد یا دسترسی به آن ندارید.</p>
        <Link href="/battles" className="mt-4 inline-block text-gold transition hover:brightness-110">بازگشت به نبردها</Link>
      </main>
    );
  }
  if (!battle) return <div className="px-4 py-24 text-center text-muted">در حال بارگذاری…</div>;

  if (battle.mode === "pool") {
    return <PoolView battle={battle} onChange={setBattle} onToggleFollow={toggleFollow} reload={load} />;
  }

  const round = battle.rounds[shown];
  const isDraft = battle.status === "draft";

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-border px-2.5 py-0.5">{ENTITY_TYPE_LABELS[battle.entity_type]}</span>
          <span className={active ? "text-teal" : ""}>{STATUS_LABELS[battle.status]}</span>
          {battle.is_official && <span className="text-gold">رسمی</span>}
          {battle.visibility === "unlisted" && <span>فقط با لینک</span>}
        </div>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{toFaDigits(battle.title)}</h1>
        {battle.description && <p className="max-w-2xl text-sm leading-7 text-muted">{battle.description}</p>}
        <div className="flex flex-wrap items-center gap-4 text-sm text-ink-dim">
          <span className="num">{toFaDigits(battle.total_votes)} رأی</span>
          <span className="num">{toFaDigits(battle.follower_count)} دنبال‌کننده</span>
          {!isDraft && (
            <button type="button" onClick={toggleFollow} className={`rounded-full border px-4 py-1 ${battle.is_following ? "border-gold text-gold" : "border-border"}`}>
              {battle.is_following ? "دنبال می‌کنی" : "پیگیری نبرد"}
            </button>
          )}
          {!isDraft && (
            <ShareMenu
              url={absoluteUrl(`/battles/${battle.slug}`)}
              title={`${battle.title} | CinemaGozin`}
              text={battle.title}
              size={36}
            />
          )}
          {isDraft && battle.is_owner && (
            <Link href={`/battles/new?slug=${battle.slug}`} className="rounded-full bg-gold px-4 py-1 font-bold text-bg">ادامهٔ ویرایش پیش‌نویس</Link>
          )}
        </div>
      </header>

      {battle.is_owner && <OwnerPanel key={battle.status + battle.current_round} battle={battle} onChange={setBattle} />}

      {active && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-ink">
              {roundLabel(battle.current_round, battle.total_rounds)}{" "}
              <span className="num text-xs text-muted">
                (دور {toFaDigits(battle.current_round)} از {toFaDigits(battle.total_rounds)})
              </span>
            </p>
            <p className="num text-sm text-gold">
              {deadline ? (remaining ? `پایان دور: ${remaining}` : "در حال بستن دور…") : "پایان دور: دستیِ سازنده"}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface2">
            <div className="h-full bg-teal" style={{ width: `${((battle.current_round - 1) / battle.total_rounds) * 100}%` }} />
          </div>
          {!isAuthenticated && <p className="mt-3 text-xs text-muted">برای رأی دادن باید وارد شوی؛ با زدن روی هر گزینه، فرم ورود باز می‌شود.</p>}
          {voteError && <p className="mt-3 text-sm text-red-400">{voteError}</p>}
        </section>
      )}

      {battle.status === "completed" && battle.winner && (
        <section className="mt-6 flex items-center gap-5 rounded-2xl border border-gold/50 bg-gold/5 p-5">
          <Poster entity={battle.winner} className="w-24 shrink-0" />
          <div>
            <p className="kicker text-gold">CHAMPION</p>
            <p className="font-display mt-1 text-2xl text-ink">{displayTitle(battle.winner)}</p>
            <p className="mt-1 text-sm text-muted">قهرمان «{battle.title}»</p>
          </div>
        </section>
      )}

      {isDraft ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-ink">گزینه‌ها</h2>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
            {battle.participants.map((p) => (
              <div key={p.id}><Poster entity={p} size="w185" /></div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap gap-2">
            {battle.rounds.map((r, i) => (
              <button
                key={r.round}
                type="button"
                onClick={() => setShown(i)}
                className={`rounded-full border px-4 py-1.5 text-sm ${
                  i === shown ? "border-gold text-gold" : "border-border text-muted hover:text-ink"
                }`}
              >
                {roundLabel(r.round, battle.total_rounds)}
                {active && r.round === battle.current_round && <span className="mr-1 text-teal">●</span>}
              </button>
            ))}
          </div>
          {round && (
            <div className="grid gap-4 md:grid-cols-2">
              {round.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  isCurrent={round.round === battle.current_round}
                  active={!!active}
                  pendingId={pendingMatch}
                  onVote={(entityId) => vote(m, entityId)}
                />
              ))}
            </div>
          )}
          {active && <p className="mt-4 text-xs text-muted">نتیجهٔ هر مسابقه بعد از رأی دادن تو (یا بسته شدن آن) نمایش داده می‌شود. تا پایان دور می‌توانی رأیت را عوض کنی.</p>}
        </section>
      )}
    </main>
  );
}
