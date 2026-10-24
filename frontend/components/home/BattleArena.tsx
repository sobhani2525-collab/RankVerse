"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SectionHeading from "./SectionHeading";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useInView } from "@/lib/use-in-view";
import { getThemedBattle } from "@/lib/api";
import { ThemedBattle } from "@/lib/types";
import { reasonOf, resultPath, topicOf } from "@/lib/battle-theme";
import { absoluteUrl } from "@/lib/site";
import { TournamentDetail, tournamentApi } from "@/lib/tournament";
import WinnerStaysBattle from "@/components/battle/WinnerStaysBattle";
import FeaturedBattleRun from "./FeaturedBattleRun";

// The home page's Daily battle draws with these; they live with the winner-stays component.
export { BattlePoster as Poster, VsBadge } from "@/components/battle/WinnerStaysBattle";

/**
 * The home page's "Let the movies fight": one of the admin-featured battles, picked at random
 * and played "winner stays" right here. With no featured battle it falls back to a themed run
 * (BattleArenaBody) so the section is never empty.
 */
export default function BattleArena() {
  const [sectionRef, inView] = useInView<HTMLElement>("200px 0px");
  const { getToken, loading: authLoading } = useAuth();
  // undefined = still asking, null = none featured
  const [featured, setFeatured] = useState<TournamentDetail | null | undefined>(undefined);
  const asked = useRef(false);

  const loadFeatured = useCallback(async () => {
    try {
      setFeatured(await tournamentApi.featuredRandom(getToken()));
    } catch {
      setFeatured(null);
    }
  }, [getToken]);

  useEffect(() => {
    if (!inView || authLoading || asked.current) return;
    asked.current = true;
    void loadFeatured();
  }, [inView, authLoading, loadFeatured]);

  return (
    <section ref={sectionRef} id="battle-arena" className="relative scroll-mt-16 border-y border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-5xl px-6 py-24">
        {featured === null && (
          // only the themed fallback needs the section's own title; a featured battle brings its own header
          <SectionHeading
            center
            kicker="Let the movies fight"
            title="بگذار فیلم‌ها بجنگند."
            lead="از هر جفت، یکی را انتخاب کن. برنده می‌ماند و با فیلم بعدی روبه‌رو می‌شود."
          />
        )}
        {featured === undefined ? (
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-4 sm:gap-10">
            <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
            <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
          </div>
        ) : featured ? (
          <FeaturedBattleRun key={featured.slug} battle={featured} />
        ) : (
          <BattleArenaBody enabled={inView} />
        )}
      </div>
    </section>
  );
}

/** A deep-linked pair (SuggestedBattleCard's "شروع نبرد") that opens the run once. */
export interface PreselectedPair {
  category: string;
  leftId: string;
  rightId: string;
}

/**
 * A themed quick battle over movies that share a genre, decade or director -- random for a
 * guest, built from taste for a signed-in user (GET /battles/themed). The run itself is the
 * shared WinnerStaysBattle; this only fetches pools and says where results are shared.
 * Used by the /battles?mode=quick page and as the home page's fallback.
 */
export function BattleArenaBody({
  enabled = true,
  preselected,
  initialTheme,
}: {
  enabled?: boolean;
  preselected?: PreselectedPair | null;
  /** A shared result's "تو هم نبرد کن" theme; used for the first load only. */
  initialTheme?: { kind: "genre" | "decade" | "director"; value: string } | null;
}) {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const { openLoginModal } = useAuthGate();
  // Consumed by the first load only; later runs are ordinary themed pools.
  const pair = useRef(preselected ?? null);
  const firstTheme = useRef(initialTheme ?? null);

  const [battle, setBattle] = useState<ThemedBattle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the current pool was fetched signed in, so logging in (or out)
  // swaps a random pool for a personal one.
  const loadedSignedIn = useRef<boolean | null>(null);

  const signedIn = !authLoading && isAuthenticated;

  const load = useCallback(async (avoid?: ThemedBattle["theme"]) => {
    setLoading(true);
    setError(null);
    loadedSignedIn.current = signedIn;
    const first = pair.current;
    pair.current = null;
    const theme = first ? null : firstTheme.current;
    firstTheme.current = null;
    try {
      const token = signedIn ? getToken() : null;
      let next = await getThemedBattle(token, first, theme);
      // "Skip this battle": the pool is random, so ask again (a few times at
      // most) until it isn't the theme the visitor just passed on.
      for (let i = 0; i < 4 && avoid && next.theme.kind === avoid.kind && next.theme.value === avoid.value; i++) {
        next = await getThemedBattle(token, null, null);
      }
      setBattle(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت نبرد ممکن نشد");
      setBattle(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, signedIn]);

  useEffect(() => {
    if (authLoading || !enabled || loading || error) return;
    if (!battle || loadedSignedIn.current !== signedIn) load();
  }, [authLoading, enabled, battle, loading, error, signedIn, load]);

  return (
    <>
      {error && (
        <div role="alert" className="mx-auto mb-6 max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
          {error}
          <button type="button" onClick={() => load()} className="mr-2 underline">
            تلاش دوباره
          </button>
        </div>
      )}

      {battle && !loading ? (
        <WinnerStaysBattle
          key={battle.items.map((i) => i.id).join(",")}
          items={battle.items}
          category={battle.category}
          signedIn={signedIn}
          reason={reasonOf(battle.theme)}
          share={{
            url: ({ championSlug, streak, count }) =>
              absoluteUrl(resultPath({ slug: championSlug, streak, count, theme: battle.theme })),
            topic: topicOf(battle.theme),
            battleName: topicOf(battle.theme),
            fallbackLine: `انتخاب نهایی من در «${reasonOf({ ...battle.theme, personalized: false })}»`,
          }}
          onNext={() => load()}
          onSkipBattle={() => load(battle.theme)}
          extraDoneActions={
            !signedIn ? (
              <button type="button" onClick={openLoginModal} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
                نبرد با گزینه‌های هم‌سلیقه من
              </button>
            ) : null
          }
        />
      ) : (
        !error && (
          <div className="mx-auto grid max-w-xl grid-cols-2 gap-4 sm:gap-10">
            <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
            <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
          </div>
        )
      )}

      {!signedIn && !authLoading && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">
            ورود
          </button>
          <p className="text-xs text-muted">با ورود به سایت، نبردها اختصاصی خواهند شد.</p>
        </div>
      )}
    </>
  );
}
