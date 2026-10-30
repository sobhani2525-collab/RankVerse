"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { TournamentEntity, TournamentSummary, tournamentApi } from "@/lib/tournament";
import { RunState, Slot, pickInRun, pickPayload, startRun } from "@/lib/home-battles";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { PickMark, useBattlePick } from "@/components/battle/PickMark";
import { BattlePoster, VsBadge } from "@/components/battle/WinnerStaysBattle";

type Kind = "featured" | "fresh";
const KIND_LABEL: Record<Kind, string> = { featured: "برگزیده", fresh: "تازه" };

/** «برگزیده» and «تازه» battle rows: two small posters you tap to vote, nothing else. */
export default function HomeBattleRows() {
  const { getToken, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<{ kind: Kind; battle: TournamentSummary }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const token = getToken();
    Promise.all([tournamentApi.featured(token), tournamentApi.list(token, { sort: "newest" })])
      .then(([featured, fresh]) => {
        if (cancelled) return;
        const usable = (b: TournamentSummary) => (b.preview?.length ?? 0) >= 2;
        const f = featured.find(usable);
        const n = fresh.find((b) => usable(b) && b.slug !== f?.slug);
        setRows([...(f ? [{ kind: "featured" as Kind, battle: f }] : []), ...(n ? [{ kind: "fresh" as Kind, battle: n }] : [])]);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [authLoading, getToken]);

  if (error) return <p role="alert" className="text-sm text-muted">دریافت نبردها ممکن نشد.</p>;
  if (!rows) return <div className="h-56 animate-pulse rounded-3xl bg-surface2/50" aria-busy="true" />;
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map(({ kind, battle }) => (
        <PairRow key={battle.slug} kind={kind} battle={battle} />
      ))}
    </>
  );
}

const posterOf = (e: TournamentEntity) => (e.poster_url?.startsWith("/") ? `https://image.tmdb.org/t/p/w342${e.poster_url}` : e.poster_url);

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One battle as a row. A "pool" battle is played right here, winner stays: tap a poster, it stays
 * and the next option takes the other slot until nobody is left. Like the main battle, only a
 * signed-in pick is saved. A bracket ("tournament") battle can't be played in a row, so its
 * posters just open the battle.
 */
function PairRow({ kind, battle }: { kind: Kind; battle: TournamentSummary }) {
  const { getToken, isAuthenticated } = useAuth();
  const [first, second] = battle.preview as [TournamentEntity, TournamentEntity];
  const isPool = battle.mode === "pool";
  const [run, setRun] = useState<RunState<TournamentEntity>>(() => startRun(first, second, []));
  const [votes, setVotes] = useState(battle.players_count ?? 0);
  const { picked, phase, start, busy } = useBattlePick<"0" | "1">();
  const loaded = useRef(false);

  // The rest of the options, so the winner can keep going; only for pool battles.
  useEffect(() => {
    if (!isPool || loaded.current) return;
    loaded.current = true;
    tournamentApi
      .get(battle.slug, null)
      .then((d) => {
        const rest = shuffled(d.participants.filter((p) => p.id !== first.id && p.id !== second.id));
        setRun((r) => (r.picks === 0 ? startRun(first, second, rest) : { ...r, queue: rest.filter((p) => !r.slots.some((s) => s.id === p.id)) }));
      })
      .catch(() => {});
  }, [isPool, battle.slug, first, second]);

  function vote(side: Slot) {
    if (busy || run.done) return;
    const { champion, challenger, winner } = pickPayload(run, side);
    const token = isAuthenticated ? getToken() : null;
    const request = token ? tournamentApi.pick(token, battle.slug, { champion_id: champion.id, challenger_id: challenger.id, winner_id: winner.id }) : null;
    start(String(side) as "0" | "1", request, () => {
      setVotes((v) => v + 1);
      setRun((r) => pickInRun(r, side));
    });
  }

  const posterSize = "w-[104px] sm:w-[132px]";
  return (
    <article className="flex items-center gap-5 rounded-3xl border border-[#2a2f5c] bg-[#141733] p-5">
      {run.done && run.winner ? (
        <div className={`relative shrink-0 ${posterSize}`}>
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border-[1.5px] border-gold bg-surface2 shadow-[0_0_0_4px_rgba(232,179,74,0.32)]">
            <BattlePoster item={{ poster_path: null, image_url: posterOf(run.winner) }} sizes="132px" />
          </div>
        </div>
      ) : (
        <div className="relative grid shrink-0 grid-cols-2 gap-5">
          {([0, 1] as Slot[]).map((side) => {
            const e = run.slots[side];
            const chosen = picked === String(side);
            const cls = `group relative block aspect-[2/3] ${posterSize} overflow-hidden rounded-2xl bg-surface2 text-right transition focus-visible:outline-gold disabled:cursor-default ${
              chosen ? "border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.32)]" : picked ? "border border-border opacity-50" : "border border-border hover:border-violet-light"
            }`;
            const poster = <BattlePoster item={{ poster_path: null, image_url: posterOf(e) }} sizes="132px" zoom={!picked} />;
            return isPool ? (
              <button key={side} type="button" onClick={() => vote(side)} disabled={busy} aria-pressed={chosen} aria-label={`رأی به ${displayTitle(e)}`} className={cls}>
                {poster}
                {chosen && <PickMark phase={phase} />}
              </button>
            ) : (
              <Link key={side} href={`/battles/${battle.slug}`} aria-label={displayTitle(e)} className={cls}>
                {poster}
              </Link>
            );
          })}
          <VsBadge />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs text-[#a3a8cc]">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${kind === "featured" ? "bg-[#f5b94a]/15 text-[#f5b94a]" : "bg-[#ff9a7a]/15 text-[#ff9a7a]"}`}>{KIND_LABEL[kind]}</span>
          {isPool ? "برنده می‌ماند" : "حذفی"}
        </p>
        <Link href={`/battles/${battle.slug}`} className="mt-2 block text-lg font-extrabold leading-8 text-ink hover:text-[#f5b94a]">
          {battle.title}
        </Link>
        {run.done && run.winner ? (
          <p className="mt-1 text-sm text-[#c4c8e6]">
            برندهٔ تو: <strong className="text-gold">{run.winner.title_fa || run.winner.title}</strong>
          </p>
        ) : null}
        <p className="mt-1 text-xs text-[#a3a8cc]">
          {battle.creator?.username ? `${battle.creator.username} · ` : ""}
          <span className="num">{toFaDigits(votes)}</span> رأی
        </p>
        {run.done && (
          <Link href={`/battles/${battle.slug}?view=results${run.winner ? `&mine=${encodeURIComponent(run.winner.id)}` : ""}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[#a99bff] hover:underline">
            نتیجهٔ جمعی این نبرد ←
          </Link>
        )}
      </div>
    </article>
  );
}
