"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useInView } from "@/lib/use-in-view";
import { castBattleVote, getThemedBattle } from "@/lib/api";
import { ThemedBattle, ThemedBattleItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { genreLabel } from "@/lib/genre-labels";

type Side = "left" | "right";

function reasonOf({ kind, value, personalized }: ThemedBattle["theme"]): string {
  if (kind === "pair") return "نبرد پیشنهادی برای تو";
  const base =
    kind === "genre"
      ? `همه هم‌ژانرند: ${genreLabel(value)}`
      : kind === "decade"
        ? `همه از دههٔ ${toFaDigits(value)} میلادی‌اند`
        : `همه ساختهٔ ${value}‌اند`;
  return personalized ? `بر پایهٔ سلیقهٔ تو · ${base}` : base;
}

/**
 * The home page's battle: a "winner stays" run (like the list page's) over
 * movies that share a genre, decade or director -- random for a guest, built
 * from taste for a signed-in user (GET /battles/themed). Whichever poster is
 * picked stays and faces the next movie, so a run keeps going without any
 * clicks in between. Signed-in picks are saved with POST /battles/vote; a
 * guest's aren't, and the login button says what signing in changes.
 */
export default function BattleArena() {
  const [sectionRef, inView] = useInView<HTMLElement>("200px 0px");
  return (
    <section ref={sectionRef} className="relative border-y border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <SectionHeading
          center
          kicker="Let the movies fight"
          title="بگذار فیلم‌ها بجنگند."
          lead="از هر جفت، یکی را انتخاب کن. برنده می‌ماند و با فیلم بعدی روبه‌رو می‌شود."
        />
        <BattleArenaBody enabled={inView} />
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

/** The battle itself, shared by the home section above and the /battles page. */
export function BattleArenaBody({ enabled = true, preselected }: { enabled?: boolean; preselected?: PreselectedPair | null }) {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const { openLoginModal } = useAuthGate();
  // Consumed by the first load only; later runs are ordinary themed pools.
  const pair = useRef(preselected ?? null);

  const [battle, setBattle] = useState<ThemedBattle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the current pool was fetched signed in, so logging in (or out)
  // swaps a random pool for a personal one.
  const loadedSignedIn = useRef<boolean | null>(null);

  const signedIn = !authLoading && isAuthenticated;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    loadedSignedIn.current = signedIn;
    const first = pair.current;
    pair.current = null;
    try {
      setBattle(await getThemedBattle(signedIn ? getToken() : null, first));
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
            <button type="button" onClick={load} className="mr-2 underline">
              تلاش دوباره
            </button>
          </div>
        )}

        {battle && !loading ? (
          <ThemedRun key={battle.items.map((i) => i.id).join(",")} battle={battle} signedIn={signedIn} onNext={load} />
        ) : (
          !error && (
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:gap-10">
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

function ThemedRun({ battle, signedIn, onNext }: { battle: ThemedBattle; signedIn: boolean; onNext: () => void }) {
  const { getToken } = useAuth();
  const { openLoginModal } = useAuthGate();
  const { items, category, theme } = battle;
  // The champion's index and the next challenger's (items[0] opens as champion).
  const [champion, setChampion] = useState(0);
  const [step, setStep] = useState(1);
  const [streak, setStreak] = useState(0);
  const [voted, setVoted] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const done = step >= items.length;
  const championItem = items[champion];
  const challengerItem = items[Math.min(step, items.length - 1)];

  function pick(winner: Side) {
    if (done) return;
    const token = getToken();
    if (token) {
      castBattleVote(token, {
        category,
        left_item: championItem.id,
        right_item: challengerItem.id,
        winner,
      }).catch((e) => setError(e instanceof Error ? e.message : "ثبت رأی ممکن نشد"));
    }
    if (winner === "left") {
      setStreak((n) => n + 1);
    } else {
      setChampion(step);
      setStreak(1);
    }
    setVoted((n) => n + 1);
    setStep((s) => s + 1);
  }

  const reason = (
    <p key={`reason-${step}`} className="mb-6 flex items-center justify-center gap-2 text-center text-[13px] text-violet-light" aria-live="polite">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-light" aria-hidden="true" />
      {reasonOf(theme)}
    </p>
  );

  const progress = (
    <div className="relative mx-auto mt-8 h-[3px] w-full max-w-2xl overflow-hidden rounded-full bg-surface2" aria-hidden="true">
      <div
        className="absolute inset-y-0 start-0 rounded-full bg-violet-light transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${(Math.min(step - 1, items.length - 1) / (items.length - 1)) * 100}%` }}
      />
    </div>
  );

  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        {reason}
        {progress}
        <div className="rv-rise mt-8 flex flex-col items-center gap-3 text-center">
          <div className="relative aspect-[2/3] w-28 overflow-hidden rounded-xl border-[1.5px] border-gold bg-surface2 shadow-[0_0_0_4px_rgba(232,179,74,0.18)]">
            <Poster item={championItem} sizes="112px" />
          </div>
          <p className="font-display text-2xl text-ink">نبرد تمام شد.</p>
          <p className="text-sm text-ink-dim">
            🏆 برنده: <span className="font-bold text-gold">{championItem.title_fa || championItem.title}</span>
            {streak > 0 && (
              <>
                {" · "}
                <span className="num">{toFaDigits(streak)}</span> برد پیاپی
              </>
            )}
          </p>
          {voted > 0 && getToken() && !error && <p className="text-sm text-teal">رأی‌هایت در رتبه‌بندی ثبت شد.</p>}
          {error && <p className="text-xs text-gold">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onNext} className="btn-primary text-sm hover:opacity-90">
              نبرد بعدی
            </button>
            {!signedIn && (
              <button type="button" onClick={openLoginModal} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
                نبرد با گزینه‌های هم‌سلیقه من
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const sides: [Side, ThemedBattleItem][] = [
    ["left", championItem],
    ["right", challengerItem],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {reason}

      {/* RTL grid: the champion (the vote's left_item) sits on the right. */}
      <div className="relative grid grid-cols-2 gap-4 sm:gap-10">
        {sides.map(([side, item]) => {
          const isChampion = side === "left";
          return (
            <button
              key={isChampion ? `champion-${champion}` : `challenger-${step}`}
              type="button"
              onClick={() => pick(side)}
              aria-label={`انتخاب ${displayTitle(item)}`}
              className={`group relative overflow-hidden rounded-2xl bg-surface/60 text-right transition ${
                isChampion
                  ? "border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.18)] hover:shadow-[0_0_0_4px_rgba(232,179,74,0.32)]"
                  : "border border-border hover:border-violet-light"
              }`}
            >
              <span className="relative block aspect-[2/3] w-full bg-surface2">
                <Poster item={item} sizes="(max-width: 768px) 45vw, 320px" zoom />
                <span className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-transparent to-transparent" />
              </span>
              {isChampion && streak > 0 && (
                <span className="absolute start-3 top-3 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold text-gold">
                  <span className="num">{toFaDigits(streak)}</span> برد
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 p-3">
                <span className="block line-clamp-2 text-sm font-medium text-ink">{displayTitle(item)}</span>
                <span className="num text-xs text-gold">
                  {item.computed_score != null && toFaDigits(item.computed_score.toFixed(1))}
                  {item.computed_score != null && item.year ? " · " : ""}
                  {item.year ? toFaDigits(item.year) : ""}
                </span>
              </span>
            </button>
          );
        })}
        <VsBadge />
      </div>

      {progress}

      <div className="mt-4 flex items-center justify-center gap-4">
        <span className="text-xs text-dim">
          جفت <span className="num">{toFaDigits(step)}</span> از <span className="num">{toFaDigits(items.length - 1)}</span>
        </span>
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="rounded-full border border-border px-5 py-2 text-sm text-muted transition hover:bg-surface2"
        >
          رد کردن این جفت
        </button>
      </div>
      {error && <p className="mt-3 text-center text-xs text-gold">{error}</p>}
    </div>
  );
}

function Poster({ item, sizes, zoom }: { item: ThemedBattleItem; sizes: string; zoom?: boolean }) {
  return item.poster_path ? (
    <Image
      src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
      alt=""
      fill
      sizes={sizes}
      className={`object-cover ${zoom ? "transition duration-500 group-hover:scale-105" : ""}`}
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-xs text-muted">بدون پوستر</span>
  );
}

function VsBadge() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-[#05070D] font-mono text-xs font-bold tracking-widest text-violet-light shadow-[0_0_0_6px_rgba(5,7,13,0.9),0_0_36px_rgba(145,99,245,0.55)] sm:h-16 sm:w-16 sm:text-base"
    >
      VS
    </span>
  );
}
