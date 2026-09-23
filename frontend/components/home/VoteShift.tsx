"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SectionHeading from "./SectionHeading";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useInView } from "@/lib/use-in-view";
import { getMyRatings, getRankingsPage, rateEntity } from "@/lib/api";
import { MovieListItem } from "@/lib/types";
import { HomeTitle } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

const WINDOW = 20; // how deep we read the ranking to locate movement
const SHOWN = 5;

type Phase = "idle" | "saving" | "done" | "error";

function rankOf(list: MovieListItem[], id: string): number | null {
  const i = list.findIndex((m) => m.id === id);
  return i >= 0 ? i + 1 : null;
}

/**
 * A real before/after. "Before" is a fresh (uncached) read of the top of
 * the movie ranking; the rating goes through the same POST
 * /movies/{slug}/rate the detail page uses, which recomputes that title's
 * score synchronously on the backend; "after" is a second fresh read.
 * Whatever moved (or didn't) is exactly what the API returned.
 */
export default function VoteShift({ guestPreview }: { guestPreview: HomeTitle[] }) {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [ref, inView] = useInView<HTMLElement>("200px 0px");

  const [before, setBefore] = useState<MovieListItem[] | null>(null);
  const [after, setAfter] = useState<MovieListItem[] | null>(null);
  const [myScores, setMyScores] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadError, setLoadError] = useState(false);
  const [ratedScore, setRatedScore] = useState<number | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadError(false);
    try {
      const [page, ratings] = await Promise.all([
        getRankingsPage("movie", { page_size: WINDOW }, { fresh: true }),
        getMyRatings(token).catch(() => []),
      ]);
      setBefore(page.items);
      setSelectedId((id) => id ?? page.items[0]?.id ?? null);
      setMyScores(Object.fromEntries(ratings.map((r) => [r.movie_slug, r.score])));
    } catch {
      setLoadError(true);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAuthenticated && inView && !before && !loadError) load();
  }, [isAuthenticated, inView, before, loadError, load]);

  const selected = before?.find((m) => m.id === selectedId) ?? null;

  async function submit(score: number) {
    const token = getToken();
    if (!token || !selected || phase === "saving") return;
    setPhase("saving");
    setRatedScore(score);
    try {
      await rateEntity(token, selected.slug, score, "movie");
      const page = await getRankingsPage("movie", { page_size: WINDOW }, { fresh: true });
      setAfter(page.items);
      setMyScores((s) => ({ ...s, [selected.slug]: score }));
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }

  function again() {
    if (after) setBefore(after);
    setAfter(null);
    setPhase("idle");
    setRatedScore(null);
  }

  const signedIn = !authLoading && isAuthenticated;

  // --- Summary of what actually changed for the rated title ---
  let summary: string | null = null;
  if (phase === "done" && selected && before && after) {
    const r0 = rankOf(before, selected.id);
    const r1 = rankOf(after, selected.id);
    const s0 = selected.computed_score;
    const s1 = after.find((m) => m.id === selected.id)?.computed_score ?? null;
    const rankText =
      r1 === null
        ? `از ${toFaDigits(WINDOW)} رتبهٔ اول بیرون رفت`
        : r0 === r1
        ? `در رتبهٔ ${toFaDigits(r1)} ماند`
        : `از رتبهٔ ${toFaDigits(r0 ?? "—")} به ${toFaDigits(r1)} رسید`;
    const scoreText =
      s0 !== null && s1 !== null
        ? s0 === s1
          ? "امتیازش تغییری نکرد"
          : `امتیاز ${toFaDigits(s0.toFixed(2))} ← ${toFaDigits(s1.toFixed(2))}`
        : null;
    summary = [`«${displayTitle(selected)}» ${rankText}`, scoreText].filter(Boolean).join(" · ");
  }

  return (
    <section ref={ref} className="mx-auto max-w-7xl px-6 py-24">
      <SectionHeading
        kicker="Your vote changes the universe"
        title="رأی تو کهکشان را تغییر می‌دهد."
        lead="یکی از فیلم‌های صدر را که دیده‌ای امتیاز بده؛ رتبه‌بندی بلافاصله دوباره خوانده می‌شود و تغییر واقعی را می‌بینی."
      />

      {!signedIn ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <RankColumn label="Now" title="الان" items={guestPreview.slice(0, SHOWN).map((t) => ({ id: t.id, title: displayTitle(t), score: t.score }))} />
          <div className="flex flex-col items-start justify-center gap-4 rounded-3xl border border-dashed border-white/10 p-8">
            <p className="text-lg text-ink">امتیاز تو هم در این ترتیب سهم دارد.</p>
            <p className="text-sm leading-7 text-muted">برای ثبت امتیاز و دیدن جابه‌جایی واقعی رتبه‌ها وارد حساب شوید.</p>
            <button type="button" onClick={() => requireAuth(load)} className="btn-primary text-sm hover:opacity-90">
              ورود و امتیازدهی
            </button>
          </div>
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-sm text-muted">
          خواندن رتبه‌بندی ممکن نشد.
          <button type="button" onClick={load} className="mr-2 text-gold underline">
            تلاش دوباره
          </button>
        </div>
      ) : !before ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-3xl bg-surface2/60" />
          <div className="h-72 animate-pulse rounded-3xl bg-surface2/60" />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* BEFORE + picker */}
          <div>
            <p className="kicker text-muted/70">Before</p>
            <p className="mt-1 text-sm text-muted">یک فیلم را انتخاب کن</p>
            <ol className="mt-4 space-y-2" role="radiogroup" aria-label="انتخاب فیلم برای امتیازدهی">
              {before.slice(0, SHOWN).map((m, i) => {
                const active = m.id === selectedId;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={phase === "saving" || phase === "done"}
                      onClick={() => setSelectedId(m.id)}
                      className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-right transition ${
                        active ? "border-gold/50 bg-gold/10" : "border-white/5 bg-surface/40 hover:border-white/15"
                      } disabled:cursor-default`}
                    >
                      <span className={`num w-8 text-lg ${active ? "text-gold" : "text-muted"}`}>{toFaDigits(i + 1)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{displayTitle(m)}</span>
                      {myScores[m.slug] && <span className="num shrink-0 text-[11px] text-teal">★ {toFaDigits(myScores[m.slug])}</span>}
                      <span className="num shrink-0 text-sm text-ink-dim">{m.computed_score !== null ? toFaDigits(m.computed_score.toFixed(2)) : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {selected && phase !== "done" && (
              <div className="mt-6 rounded-2xl border border-white/5 bg-surface/40 p-5">
                <p className="text-sm text-ink">
                  امتیاز تو به «{displayTitle(selected)}»
                  {myScores[selected.slug] && (
                    <span className="text-muted"> (فعلاً <span className="num">{toFaDigits(myScores[selected.slug])}</span>)</span>
                  )}
                </p>
                <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(null)}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const lit = (hover ?? ratedScore ?? myScores[selected.slug] ?? 0) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={phase === "saving"}
                        onClick={() => submit(n)}
                        onMouseEnter={() => setHover(n)}
                        onFocus={() => setHover(n)}
                        onBlur={() => setHover(null)}
                        aria-label={`امتیاز ${n} از ۵`}
                        className={`h-11 w-11 text-2xl transition ${lit ? "text-gold" : "text-muted/40"} disabled:cursor-wait`}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
                {phase === "saving" && <p className="mt-2 text-xs text-muted">در حال ثبت و خواندن دوبارهٔ رتبه‌بندی…</p>}
                {phase === "error" && <p role="alert" className="mt-2 text-xs text-gold">ثبت امتیاز ممکن نشد؛ چیزی تغییر نکرد. دوباره تلاش کنید.</p>}
              </div>
            )}
          </div>

          {/* AFTER */}
          <div>
            <p className="kicker text-muted/70">After</p>
            <p className="mt-1 text-sm text-muted">{after ? "رتبه‌بندی پس از رأی تو" : "پس از ثبت امتیاز اینجا نمایش داده می‌شود"}</p>
            {after ? (
              <>
                <ol className="mt-4 space-y-2">
                  {after.slice(0, SHOWN).map((m, i) => {
                    const prev = rankOf(before, m.id);
                    const move = prev === null ? null : prev - (i + 1);
                    const isRated = m.id === selected?.id;
                    return (
                      <li
                        key={m.id}
                        className={`rv-rise flex items-center gap-4 rounded-xl border px-4 py-3 ${isRated ? "border-teal/50 bg-teal/10" : "border-white/5 bg-surface/40"}`}
                        style={{ ["--rv-delay" as string]: `${i * 90}ms` }}
                      >
                        <span className="num w-8 text-lg text-muted">{toFaDigits(i + 1)}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{displayTitle(m)}</span>
                        <span className="num w-10 shrink-0 text-center text-xs">
                          {move === null ? (
                            <span className="text-teal">جدید</span>
                          ) : move > 0 ? (
                            <span className="text-teal">↑{toFaDigits(move)}</span>
                          ) : move < 0 ? (
                            <span className="text-rose-400">↓{toFaDigits(-move)}</span>
                          ) : (
                            <span className="text-muted/50">—</span>
                          )}
                        </span>
                        <span className="num shrink-0 text-sm text-ink-dim">{m.computed_score !== null ? toFaDigits(m.computed_score.toFixed(2)) : "—"}</span>
                      </li>
                    );
                  })}
                </ol>
                <div className="rv-rise mt-6 rounded-2xl border border-teal/20 bg-teal/5 p-5" style={{ ["--rv-delay" as string]: "500ms" }}>
                  <p className="font-display text-xl text-ink">رأی تو ثبت شد.</p>
                  {summary && <p className="mt-2 text-sm leading-7 text-muted">{summary}</p>}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={again} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
                      امتیاز به فیلمی دیگر
                    </button>
                    {selected && (
                      <Link href={`/movies/${selected.slug}`} className="inline-flex items-center text-sm text-gold hover:underline">
                        صفحهٔ فیلم
                      </Link>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-4 flex h-[276px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-muted/60">
                ✦
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function RankColumn({ label, title, items }: { label: string; title: string; items: { id: string; title: string; score: number | null }[] }) {
  return (
    <div>
      <p className="kicker text-muted/70">{label}</p>
      <p className="mt-1 text-sm text-muted">{title}</p>
      <ol className="mt-4 space-y-2">
        {items.map((m, i) => (
          <li key={m.id} className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface/40 px-4 py-3">
            <span className="num w-8 text-lg text-muted">{toFaDigits(i + 1)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.title}</span>
            <span className="num shrink-0 text-sm text-ink-dim">{m.score !== null ? toFaDigits(m.score.toFixed(2)) : "—"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
