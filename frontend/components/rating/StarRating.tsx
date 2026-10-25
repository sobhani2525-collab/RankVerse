"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { rateEntity, unrateEntity, getMyRatings } from "@/lib/api";
import { Spinner } from "@/components/Loading";
import { toFaDigits } from "@/lib/format-number";

const STAR_COUNT = 5;

/** Fired by WatchedButton; StarRating answers it if the user hasn't rated yet. */
export const RATING_NUDGE_EVENT = "rv:nudge-rating";

/**
 * The shape StarRating needs to activate: any entity carrying
 * total_votes (movies, tv series today) gets the widget, per the
 * project's "building blocks activate on data presence" convention
 * (see lib/entity-registry.tsx) -- a future ratable entity type just
 * needs total_votes/entity_type added to its own schema, no change here.
 * total_votes is optional in the TYPE (not just at runtime) so this
 * stays true even if a future caller's object is only partially known.
 */
export interface RatableEntity {
  slug: string;
  entity_type: string;
  total_votes?: number;
}

export default function StarRating({ entity, bare = false }: { entity: RatableEntity; bare?: boolean }) {
  const { token, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);
  // Attention animation: stars light up one by one (right -> left in RTL).
  const [pulse, setPulse] = useState(0);
  const [nudging, setNudging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    function onNudge(e: Event) {
      const slug = (e as CustomEvent<{ slug: string }>).detail?.slug;
      if (slug !== entity.slug || selectedRef.current !== null) return;
      timers.forEach(clearTimeout);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setNudging(true);
      setPulse(0);
      for (let n = 1; n <= STAR_COUNT; n++) timers.push(setTimeout(() => setPulse(n), 450 + n * 170));
      timers.push(setTimeout(() => setPulse(0), 450 + STAR_COUNT * 170 + 900));
      timers.push(setTimeout(() => setNudging(false), 450 + STAR_COUNT * 170 + 1300));
    }
    window.addEventListener(RATING_NUDGE_EVENT, onNudge);
    return () => {
      window.removeEventListener(RATING_NUDGE_EVENT, onNudge);
      timers.forEach(clearTimeout);
    };
  }, [entity.slug]);

  useEffect(() => {
    if (!token) return;
    getMyRatings(token)
      .then((ratings) => {
        const existing = ratings.find((r) => r.movie_slug === entity.slug);
        if (existing) setSelected(existing.score);
      })
      .catch(() => {});
  }, [token, entity.slug]);

  // Data-presence gate, not an entity_type check: anything without
  // total_votes hasn't opted into the rating feature at the schema
  // level, so there's nothing for this widget to do.
  if (typeof entity.total_votes !== "number") return null;

  async function doSubmit(score: number) {
    const authToken = getToken();
    if (!authToken || busy) return;

    const previous = selected;
    setSelected(score); // optimistic
    setHasError(false);
    setBusy(true);
    try {
      await rateEntity(authToken, entity.slug, score, entity.entity_type);
    } catch {
      setSelected(previous); // rollback
      setHasError(true);
    } finally {
      setBusy(false);
    }
  }

  async function doRemove() {
    const authToken = getToken();
    if (!authToken || busy) return;

    const previous = selected;
    setSelected(null); // optimistic
    setHasError(false);
    setBusy(true);
    try {
      await unrateEntity(authToken, entity.slug, entity.entity_type);
    } catch {
      setSelected(previous); // rollback
      setHasError(true);
    } finally {
      setBusy(false);
    }
  }

  const displayValue = hovered ?? selected ?? pulse;
  const filledCount = Math.max(0, Math.min(STAR_COUNT, displayValue));

  const ratePrompt = entity.entity_type === "tv_series" ? "به این سریال امتیاز بده" : "به این فیلم امتیاز بده";

  return (
    <div
      ref={rootRef}
      className={`${bare ? "" : "rounded-xl border border-border bg-surface/60 px-5 py-4"} ${
        nudging ? "rounded-xl ring-2 ring-gold/60 ring-offset-4 ring-offset-transparent animate-pulse" : ""
      }`}
    >
      <div
        className="relative inline-flex"
        style={{ width: STAR_COUNT * 44, height: 44 }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Visual layer: two fixed, always-5-star rows stacked on top of each
            other -- only the gold->teal one's clip-path animates with hover,
            so the DOM/width never changes shape (no wrapper resizing, no
            spans mounting/unmounting) and can't nudge the card's layout. */}
        <div className={`pointer-events-none absolute inset-0 flex ${bare ? "text-white/25" : "text-muted/50"}`} aria-hidden="true">
          {Array.from({ length: STAR_COUNT }, (_, i) => (
            <span key={i} className="flex h-11 w-11 shrink-0 items-center justify-center text-[32px] leading-none">
              ★
            </span>
          ))}
        </div>
        <div
          className="pointer-events-none absolute inset-0 flex text-gold"
          aria-hidden="true"
          style={{ clipPath: `inset(0 0 0 ${(STAR_COUNT - filledCount) * 44}px)` }}
        >
          {Array.from({ length: STAR_COUNT }, (_, i) => (
            <span key={i} className="flex h-11 w-11 shrink-0 items-center justify-center text-[32px] leading-none">
              ★
            </span>
          ))}
        </div>

        {/* Interactive layer: real buttons, each a >=44px touch target. */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => requireAuth(() => doSubmit(n))}
              onMouseEnter={() => setHovered(n)}
              onFocus={() => setHovered(n)}
              onBlur={() => setHovered(null)}
              aria-label={`امتیاز ${n} از ${STAR_COUNT}`}
              aria-pressed={selected === n}
              className="h-11 w-11 shrink-0 disabled:cursor-not-allowed"
            />
          ))}
        </div>
      </div>

      <div className={`mt-2 flex flex-wrap items-center gap-2 font-sans text-sm ${bare ? "text-white/60" : "text-muted"}`}>
        {busy ? (
          <>
            <Spinner className="h-4 w-4" />
            {selected !== null ? "در حال ثبت امتیاز…" : "در حال حذف امتیاز…"}
          </>
        ) : selected !== null ? (
          <>
            <span className="text-teal">
              امتیاز شما ثبت شد · <span className="num">{toFaDigits(selected)}</span> از{" "}
              <span className="num">{toFaDigits(STAR_COUNT)}</span>
            </span>
            <button
              type="button"
              onClick={doRemove}
              disabled={busy}
              className="rounded-lg border border-border-soft px-2 py-0.5 text-xs text-muted transition hover:border-gold hover:text-gold disabled:opacity-50"
            >
              حذف رأی
            </button>
          </>
        ) : (
          nudging ? "حالا به این عنوان امتیاز بده ⭐" : ratePrompt
        )}
      </div>

      {hasError && (
        <p className="mt-2 text-xs text-gold">
          ثبت امتیاز با خطا مواجه شد. دوباره تلاش کنید.
        </p>
      )}
    </div>
  );
}
