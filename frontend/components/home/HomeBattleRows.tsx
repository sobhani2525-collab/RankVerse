"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { TournamentEntity, TournamentSummary, tournamentApi } from "@/lib/tournament";
import { PairSide, PairVoteState, applyPairVote } from "@/lib/home-battles";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { PickMark } from "@/components/battle/PickMark";
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

function PairRow({ kind, battle }: { kind: Kind; battle: TournamentSummary }) {
  const { getToken, isAuthenticated } = useAuth();
  const [state, setState] = useState<PairVoteState>({ chosen: null, votes: battle.players_count ?? 0 });
  const [phase, setPhase] = useState<"loading" | "done" | null>(null);
  const [a, b] = battle.preview as [TournamentEntity, TournamentEntity];

  // Like the main battle: a guest's tap is shown but only a signed-in pick is saved.
  async function vote(side: PairSide) {
    if (state.chosen) return;
    setState(applyPairVote(state, side));
    setPhase("loading");
    const token = isAuthenticated ? getToken() : null;
    await Promise.all([
      token
        ? tournamentApi
            .pick(token, battle.slug, { champion_id: a.id, challenger_id: b.id, winner_id: side === "a" ? a.id : b.id })
            .catch(() => undefined)
        : null,
      new Promise((r) => setTimeout(r, 350)),
    ]);
    setPhase("done");
  }

  return (
    <article className="flex items-center gap-5 rounded-3xl border border-[#2a2f5c] bg-[#141733] p-5">
      <div className="relative grid shrink-0 grid-cols-2 gap-5">
        {([["a", a], ["b", b]] as [PairSide, TournamentEntity][]).map(([side, e]) => (
          <button
            key={side}
            type="button"
            onClick={() => vote(side)}
            disabled={!!state.chosen}
            aria-pressed={state.chosen === side}
            aria-label={`رأی به ${displayTitle(e)}`}
            className={`group relative block aspect-[2/3] w-[104px] overflow-hidden rounded-2xl bg-surface2 text-right transition focus-visible:outline-gold disabled:cursor-default sm:w-[132px] ${
              state.chosen === side
                ? "border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.32)]"
                : state.chosen
                  ? "border border-border opacity-50"
                  : "border border-border hover:border-violet-light"
            }`}
          >
            <BattlePoster
              item={{ poster_path: null, image_url: e.poster_url?.startsWith("/") ? `https://image.tmdb.org/t/p/w342${e.poster_url}` : e.poster_url }}
              sizes="132px"
              zoom={!state.chosen}
            />
            {state.chosen === side && <PickMark phase={phase} />}
          </button>
        ))}
        <VsBadge />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs text-[#a3a8cc]">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${kind === "featured" ? "bg-[#f5b94a]/15 text-[#f5b94a]" : "bg-[#ff9a7a]/15 text-[#ff9a7a]"}`}>{KIND_LABEL[kind]}</span>
          برنده می‌ماند
        </p>
        <Link href={`/battles/${battle.slug}`} className="mt-2 block text-lg font-extrabold leading-8 text-ink hover:text-[#f5b94a]">
          {battle.title}
        </Link>
        <p className="mt-1 text-xs text-[#a3a8cc]">
          {battle.creator?.username ? `${battle.creator.username} · ` : ""}
          <span className="num">{toFaDigits(state.votes)}</span> رأی
        </p>
      </div>
    </article>
  );
}
