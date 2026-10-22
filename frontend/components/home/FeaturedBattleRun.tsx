"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { absoluteUrl } from "@/lib/site";
import { TournamentDetail, tournamentApi } from "@/lib/tournament";
import BattleHeader from "@/components/battle/BattleHeader";
import WinnerStaysBattle, { DONE_ACTION, Side, WinnerStaysItem } from "@/components/battle/WinnerStaysBattle";

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** An admin-featured battle played right on the home page; its picks count like picks made on its own page. */
export default function FeaturedBattleRun({ battle }: { battle: TournamentDetail }) {
  const router = useRouter();
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
      <BattleHeader
        battle={{
          title: battle.title,
          description: battle.description,
          creator: battle.creator,
          optionCount: battle.participants.length,
          followerCount: battle.follower_count,
        }}
        titleHref={`/battles/${battle.slug}`}
        badge={
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-bold text-gold">
            <span aria-hidden="true">★</span>
            نبرد برگزیده
          </span>
        }
      />

      <WinnerStaysBattle
        items={items}
        category={battle.entity_type}
        signedIn={signedIn}
        reason="هر بار برنده می‌ماند و با گزینهٔ بعدی روبه‌رو می‌شود"
        share={{ url: absoluteUrl(`/battles/${battle.slug}`), topic: null, battleName: battle.title }}
        savePick={savePick}
        onNext={() => router.push("/battles")}
        onSkipBattle={() => router.push("/battles")}
        extraDoneActions={
          <Link href={`/battles/${battle.slug}`} className={DONE_ACTION}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 20V10M12 20V4M19 20v-7" />
            </svg>
            نتیجهٔ جمعی این نبرد
          </Link>
        }
      />
    </div>
  );
}
