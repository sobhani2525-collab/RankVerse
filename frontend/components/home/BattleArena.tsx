"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import BattleCard from "@/components/BattleCard";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useInView } from "@/lib/use-in-view";
import { castBattleVote, getNextBattle } from "@/lib/api";
import { NextBattleResponse, VoteOutcome } from "@/lib/types";
import { HomeTitle } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

type Reveal = { leftDelta: number; rightDelta: number } | null;

/**
 * The /battles flow, embedded. Signed-in visitors get a real pair from
 * GET /battles/next and their pick is saved with POST /battles/vote -- the
 * Elo change shown afterwards is the API's own before/after, not an
 * animation guess. Guests see two real top titles as a clearly-labelled
 * preview; choosing one opens the login gate and nothing is recorded.
 */
export default function BattleArena({ preview }: { preview: [HomeTitle, HomeTitle] | null }) {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [sectionRef, inView] = useInView<HTMLElement>("200px 0px");

  const [battle, setBattle] = useState<NextBattleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal>(null);
  const [outcomes, setOutcomes] = useState<{ left?: "win" | "lose"; right?: "win" | "lose" }>({});

  const loadBattle = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    setReveal(null);
    setOutcomes({});
    try {
      setBattle(await getNextBattle(token, "movie"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت نبرد ممکن نشد");
      setBattle(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Only fetch a pair once the section is near the viewport.
  useEffect(() => {
    if (isAuthenticated && inView && !battle && !loading && !error) loadBattle();
  }, [isAuthenticated, inView, battle, loading, error, loadBattle]);

  async function vote(winner: VoteOutcome) {
    const token = getToken();
    if (!token || !battle || voting || reveal) return;
    setVoting(true);
    setError(null);
    if (winner === "left") setOutcomes({ left: "win", right: "lose" });
    if (winner === "right") setOutcomes({ left: "lose", right: "win" });
    try {
      const result = await castBattleVote(token, {
        category: battle.category,
        left_item: battle.left.id,
        right_item: battle.right.id,
        winner,
      });
      setReveal({
        leftDelta: Math.round(result.left_score_after - result.left_score_before),
        rightDelta: Math.round(result.right_score_after - result.right_score_before),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت رأی ممکن نشد");
      setOutcomes({});
    } finally {
      setVoting(false);
    }
  }

  const signedIn = !authLoading && isAuthenticated;

  return (
    <section ref={sectionRef} className="relative border-y border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <SectionHeading
          center
          kicker="Let the movies fight"
          title="بگذار فیلم‌ها بجنگند."
          lead="از هر جفت، یکی را انتخاب کن. هر انتخاب امتیاز Elo هر دو را جابه‌جا می‌کند."
        />

        {error && (
          <div role="alert" className="mx-auto mb-6 max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
            {error}
            <button type="button" onClick={loadBattle} className="mr-2 underline">
              تلاش دوباره
            </button>
          </div>
        )}

        {signedIn ? (
          loading || !battle ? (
            !error && (
              <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:gap-10">
                <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
                <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
              </div>
            )
          ) : (
            <div className="mx-auto max-w-2xl">
              <div className="relative grid grid-cols-2 gap-4 sm:gap-10">
                <BattleCard
                  entity={battle.left}
                  entityType={battle.category}
                  onSelect={() => vote("left")}
                  disabled={voting || !!reveal}
                  revealScore={!!reveal}
                  scoreDelta={reveal?.leftDelta}
                  outcome={outcomes.left}
                />
                <VsBadge />
                <BattleCard
                  entity={battle.right}
                  entityType={battle.category}
                  onSelect={() => vote("right")}
                  disabled={voting || !!reveal}
                  revealScore={!!reveal}
                  scoreDelta={reveal?.rightDelta}
                  outcome={outcomes.right}
                />
              </div>

              <div className="mt-8 flex min-h-[88px] flex-col items-center justify-center gap-3 text-center">
                {reveal ? (
                  <div className="rv-rise flex flex-col items-center gap-3">
                    <p className="font-display text-2xl text-ink">رأی تو ثبت شد.</p>
                    <p className="text-sm text-teal">کهکشان کمی جابه‌جا شد.</p>
                    <div className="flex gap-3">
                      <button type="button" onClick={loadBattle} className="btn-primary text-sm hover:opacity-90">
                        نبرد بعدی
                      </button>
                      <Link href="/battles" className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
                        همهٔ نبردها
                      </Link>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => vote("skip")}
                    disabled={voting}
                    className="rounded-full border border-border px-5 py-2 text-sm text-muted transition hover:bg-surface2 disabled:opacity-60"
                  >
                    رد کردن این جفت
                  </button>
                )}
              </div>
            </div>
          )
        ) : (
          preview && (
            <div className="mx-auto max-w-2xl">
              <p className="mb-5 text-center text-xs text-muted">
                پیش‌نمایش با دو عنوان برتر فعلی — برای رأی واقعی وارد شوید.
              </p>
              <div className="relative grid grid-cols-2 gap-4 sm:gap-10">
                {preview.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => requireAuth(loadBattle)}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-surface/60 text-right transition hover:border-gold/40"
                  >
                    <span className="relative block aspect-[2/3] w-full bg-surface2">
                      {t.posterUrl && <Image src={t.posterUrl} alt="" fill sizes="(max-width: 768px) 45vw, 320px" className="object-cover transition duration-500 group-hover:scale-105" />}
                      <span className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-transparent to-transparent" />
                    </span>
                    <span className="absolute inset-x-0 bottom-0 p-3">
                      <span className="block line-clamp-2 text-sm font-medium text-ink">{displayTitle(t)}</span>
                      {t.score !== null && <span className="num text-xs text-gold">{toFaDigits(t.score.toFixed(1))}</span>}
                    </span>
                  </button>
                ))}
                <VsBadge />
              </div>
              <div className="mt-8 flex justify-center">
                <button type="button" onClick={() => requireAuth(loadBattle)} className="btn-primary text-sm hover:opacity-90">
                  ورود و شروع نبرد
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function VsBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-[38%] z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-[#05070D] font-mono text-xs tracking-widest text-muted shadow-[0_0_40px_rgba(145,99,245,0.35)] sm:h-16 sm:w-16 sm:text-sm"
    >
      VS
    </span>
  );
}
