"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { TournamentSummary, tournamentApi } from "@/lib/tournament";
import TournamentCard from "@/components/tournament/TournamentCard";

type Kind = "featured" | "fresh" | "suggested";
const KIND_LABEL: Record<Kind, string> = { featured: "برگزیده", fresh: "تازه", suggested: "پیشنهادی" };
const KIND_STYLE: Record<Kind, string> = {
  featured: "bg-[#f5b94a] text-[#0b0d1c]",
  fresh: "bg-[#ff9a7a] text-[#0b0d1c]",
  suggested: "bg-[#a99bff] text-[#0b0d1c]",
};

const pickRandom = <T,>(items: T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

/** «برگزیده» and «تازه» battles, as the same battle cards the profile page shows. */
export default function HomeBattleRows({ children }: { children?: React.ReactNode }) {
  const { getToken, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<{ kind: Kind; battle: TournamentSummary }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const token = getToken();
    Promise.all([tournamentApi.featured(token), tournamentApi.list(token, { sort: "newest" }), tournamentApi.list(token, { sort: "popular" })])
      .then(([featured, fresh, popular]) => {
        if (cancelled) return;
        const usable = (b: TournamentSummary) => (b.preview?.length ?? 0) >= 2;
        const f = pickRandom(featured.filter(usable));
        const n = fresh.find((b) => usable(b) && b.slug !== f?.slug);
        // «پیشنهادی»: a random battle from the most-played ones, not already shown above
        const g = pickRandom(popular.filter((b) => usable(b) && b.slug !== f?.slug && b.slug !== n?.slug));
        setRows([
          ...(f ? [{ kind: "featured" as Kind, battle: f }] : []),
          ...(n ? [{ kind: "fresh" as Kind, battle: n }] : []),
          ...(g ? [{ kind: "suggested" as Kind, battle: g }] : []),
        ]);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [authLoading, getToken]);

  if (error) return <p role="alert" className="text-sm text-muted">دریافت نبردها ممکن نشد.</p>;
  if (!rows) return <div className="h-56 animate-pulse rounded-3xl bg-surface2/50" aria-busy="true" />;
  if (rows.length === 0) return <>{children}</>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map(({ kind, battle }) => (
        <div key={battle.slug} className="relative">
          <span className={`absolute left-3 top-3 z-20 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span>
          <TournamentCard battle={battle} />
        </div>
      ))}
      {children}
    </div>
  );
}
