"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { absoluteUrl } from "@/lib/site";
import { toFaDigits } from "@/lib/format-number";
import { TournamentDetail, tournamentApi } from "@/lib/tournament";
import WinnerStaysBattle, { Side, WinnerStaysItem } from "@/components/battle/WinnerStaysBattle";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** An admin-featured battle played right on the home page; its picks count like picks made on its own page. */
export default function FeaturedBattleRun({ battle, onAnother }: { battle: TournamentDetail; onAnother: () => void }) {
  const { getToken, isAuthenticated, loading: authLoading } = useAuth();
  const signedIn = !authLoading && isAuthenticated;

  const items: WinnerStaysItem[] = useMemo(
    () =>
      shuffled(battle.participants).map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        title_fa: p.title_fa,
        entity_type: p.entity_type,
        poster_path: p.poster_url?.startsWith("/") ? p.poster_url : null,
        year: p.year ?? null,
      })),
    [battle.slug, battle.participants] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const savePick = useCallback(
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

  return (
    <div>
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <span className="kicker text-gold">نبرد برگزیده</span>
        <Link href={`/battles/${battle.slug}`} className="font-display text-2xl text-ink transition hover:text-gold sm:text-3xl">
          {battle.title}
        </Link>
        <p className="text-xs text-muted">
          {battle.creator ? (
            <>
              ساختهٔ <span dir="ltr">@{battle.creator.username}</span> ·{" "}
            </>
          ) : null}
          <span dir="rtl">{toFaDigits(battle.participants.length)} گزینه</span>
        </p>
      </div>

      <WinnerStaysBattle
        items={items}
        category={battle.entity_type}
        signedIn={signedIn}
        reason="هر بار برنده می‌ماند و با گزینهٔ بعدی روبه‌رو می‌شود"
        share={{ url: absoluteUrl(`/battles/${battle.slug}`), topic: null, battleName: battle.title }}
        savePick={savePick}
        onNext={onAnother}
        onSkipBattle={onAnother}
        extraDoneActions={
          <Link href={`/battles/${battle.slug}`} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
            نتیجهٔ جمعی این نبرد
          </Link>
        }
      />
    </div>
  );
}
