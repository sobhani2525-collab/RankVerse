"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useInView } from "@/lib/use-in-view";
import { getMyRatings, getMyTasteDna, UserRating } from "@/lib/api";
import { TasteProfile } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; ratings: UserRating[]; taste: TasteProfile | null };

/**
 * The signed-in visitor's own corner of the map, built only from what the
 * API returns for them: their ratings (count, average, the titles
 * themselves) and, when computed, their Taste DNA's top genres and
 * contribution stats. Guests and users with no ratings get an onboarding
 * state that points at the real rating flow -- no placeholder numbers.
 */
export default function PersonalUniverse({ startHref }: { startHref: string }) {
  const { isAuthenticated, loading: authLoading, user, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [ref, inView] = useInView<HTMLElement>("200px 0px");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!isAuthenticated || !inView) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([getMyRatings(token), getMyTasteDna(token).catch(() => null)])
      .then(([ratings, taste]) => !cancelled && setState({ status: "ready", ratings, taste }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, inView, getToken]);

  const signedIn = !authLoading && isAuthenticated;
  const ready = signedIn && state.status === "ready" ? state : null;
  const ratings = ready?.ratings ?? [];

  return (
    <section ref={ref} className="relative border-y border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading kicker="Your cinema" title="سینمای تو." />

        {signedIn && state.status === "loading" && <div className="h-80 animate-pulse rounded-3xl bg-surface2/50" />}

        {signedIn && state.status === "error" && (
          <p role="alert" className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-sm text-muted">
            دریافت اطلاعات حساب ممکن نشد.
          </p>
        )}

        {(!signedIn || (ready && ratings.length === 0)) && (
          <div className="relative flex flex-col items-center overflow-hidden rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
            <EmptyOrbit />
            <p className="relative mt-8 font-display text-2xl text-ink">کهکشان شخصی‌ات منتظر است.</p>
            <p className="relative mt-3 max-w-md text-sm leading-7 text-muted">
              به فیلم‌هایی که دیده‌ای امتیاز بده؛ هر امتیاز یک ستاره به نقشهٔ خودت اضافه می‌کند و سلیقه‌ات کم‌کم شکل می‌گیرد.
            </p>
            {signedIn ? (
              <Link href={startHref} className="btn-primary relative mt-6 text-sm hover:opacity-90">
                شروع امتیازدهی
              </Link>
            ) : (
              <button type="button" onClick={() => requireAuth(() => {})} className="btn-primary relative mt-6 text-sm hover:opacity-90">
                ورود و شروع امتیازدهی
              </button>
            )}
          </div>
        )}

        {ready && ratings.length > 0 && <Dashboard username={user?.username ?? ""} ratings={ratings} taste={ready.taste} />}
      </div>
    </section>
  );
}

function Dashboard({ username, ratings, taste }: { username: string; ratings: UserRating[]; taste: TasteProfile | null }) {
  const avg = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
  const topGenres = (taste?.dimensions ?? [])
    .filter((d) => d.dimension_type === "genre")
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const stats = taste?.contribution_stats ?? null;

  // Orbit: higher personal score = closer to you.
  const orbit = ratings.slice(0, 10).map((r, i, arr) => {
    const angle = ((-90 + (360 / arr.length) * i) * Math.PI) / 180;
    const radius = 18 + (5 - r.score) * 6.5;
    return { r, x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div className="relative mx-auto aspect-square w-full max-w-[440px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {[18, 31, 44].map((rad) => (
            <circle key={rad} cx="50" cy="50" r={rad} fill="none" stroke="#F2F0E8" strokeOpacity="0.05" strokeWidth="0.2" />
          ))}
          {orbit.map(({ r, x, y }) => (
            <line key={r.id} x1="50" y1="50" x2={x} y2={y} stroke="#9163f5" strokeOpacity="0.25" strokeWidth="0.2" />
          ))}
        </svg>
        <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gold/50 bg-surface2 font-bold uppercase text-gold shadow-[0_0_50px_-10px_rgba(232,179,74,0.6)]">
          {username.charAt(0)}
        </span>
        {orbit.map(({ r, x, y }) => (
          <span
            key={r.id}
            title={`${r.movie_title} — ${r.score}/5`}
            className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border border-white/15 bg-surface2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {r.movie_poster_path && <Image src={`https://image.tmdb.org/t/p/w92${r.movie_poster_path}`} alt="" fill sizes="40px" className="object-cover" />}
          </span>
        ))}
        <p className="absolute inset-x-0 bottom-0 text-center text-[11px] text-muted/70">نزدیک‌تر = امتیاز بالاتر تو</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric kicker="Rated" label="فیلم امتیازداده‌شده" value={toFaDigits(ratings.length)} />
        <Metric kicker="Average" label="میانگین امتیاز تو (از ۵)" value={toFaDigits(avg.toFixed(1))} />
        {stats && <Metric kicker="Battles" label="نبرد رأی‌داده‌شده" value={toFaDigits(stats.battles_count)} />}
        {topGenres.length > 0 && (
          <div className="rounded-2xl border border-white/5 bg-surface/40 p-5 sm:col-span-2">
            <p className="kicker text-muted/70">Favourite genres</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {topGenres.map((g) => (
                <span key={g.dimension_key} className="rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-sm text-teal">
                  {genreLabel(g.dimension_key)}
                </span>
              ))}
            </div>
          </div>
        )}
        <Link href="/profile" className="btn-secondary justify-center text-sm hover:border-gold/40 hover:text-gold sm:col-span-2">
          پروفایل و DNA سلیقه
        </Link>
      </div>
    </div>
  );
}

function Metric({ kicker, label, value }: { kicker: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-surface/40 p-5">
      <p className="kicker text-muted/70">{kicker}</p>
      <p className="num mt-2 text-3xl text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

// Decorative empty orbit for the onboarding state (no data implied).
function EmptyOrbit() {
  return (
    <svg viewBox="0 0 100 100" className="h-40 w-40" aria-hidden="true">
      {[16, 30, 44].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#F2F0E8" strokeOpacity="0.08" strokeWidth="0.4" strokeDasharray="1 2" />
      ))}
      <circle cx="50" cy="50" r="4" fill="#E8B34A" className="rv-twinkle" />
    </svg>
  );
}
