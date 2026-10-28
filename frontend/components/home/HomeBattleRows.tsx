"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { TournamentEntity, TournamentSummary, tournamentApi } from "@/lib/tournament";
import { PairSide, PairVoteState, applyPairVote } from "@/lib/home-battles";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";

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
  if (!rows) return <div className="h-40 animate-pulse rounded-3xl bg-surface2/50" aria-busy="true" />;
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-4">
      {rows.map(({ kind, battle }) => (
        <PairRow key={battle.slug} kind={kind} battle={battle} />
      ))}
    </div>
  );
}

function PairRow({ kind, battle }: { kind: Kind; battle: TournamentSummary }) {
  const { getToken, isAuthenticated } = useAuth();
  const { openLoginModal } = useAuthGate();
  const [state, setState] = useState<PairVoteState>({ chosen: null, votes: battle.players_count ?? 0 });
  const [a, b] = battle.preview as [TournamentEntity, TournamentEntity];

  async function vote(side: PairSide) {
    const token = getToken();
    if (!isAuthenticated || !token) return openLoginModal();
    if (state.chosen) return;
    const prev = state;
    setState(applyPairVote(state, side));
    try {
      await tournamentApi.pick(token, battle.slug, {
        champion_id: a.id,
        challenger_id: b.id,
        winner_id: side === "a" ? a.id : b.id,
      });
    } catch {
      setState(prev);
    }
  }

  return (
    <article className="flex items-center gap-4 rounded-3xl border border-border bg-surface/70 p-4">
      <div className="relative flex shrink-0 items-center gap-3">
        {([["a", a], ["b", b]] as [PairSide, TournamentEntity][]).map(([side, e]) => (
          <button
            key={side}
            type="button"
            onClick={() => vote(side)}
            disabled={!!state.chosen}
            aria-pressed={state.chosen === side}
            aria-label={`رأی به ${displayTitle(e)}`}
            className={`relative h-[104px] w-[72px] min-w-11 overflow-hidden rounded-xl bg-surface2 transition focus-visible:outline-gold disabled:cursor-default ${
              state.chosen === side ? "ring-2 ring-violet-soft" : state.chosen ? "opacity-40" : "hover:ring-1 hover:ring-violet-soft"
            }`}
          >
            {e.poster_url && <Image src={e.poster_url.startsWith("/") ? `https://image.tmdb.org/t/p/w185${e.poster_url}` : e.poster_url} alt="" fill sizes="72px" loading="lazy" className="object-cover" />}
          </button>
        ))}
        <span aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-violet-soft">VS</span>
      </div>
      <div className="min-w-0 flex-1">
        <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-gold">{KIND_LABEL[kind]}</span>
        <Link href={`/battles/${battle.slug}`} className="mt-2 block truncate text-base font-bold text-ink hover:text-gold">
          {battle.title}
        </Link>
        <p className="num mt-1 text-xs text-muted">{toFaDigits(state.votes)} رأی</p>
      </div>
    </article>
  );
}
