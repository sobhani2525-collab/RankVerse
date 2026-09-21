"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { rateEntity, unrateEntity, getMyRatings } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";

const STAR_COUNT = 5;

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

export default function StarRating({ entity }: { entity: RatableEntity }) {
  const { token, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasError, setHasError] = useState(false);

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

  const displayValue = hovered ?? selected ?? 0;
  const filledCount = Math.max(0, Math.min(STAR_COUNT, displayValue));

  return (
    <div className="rounded-xl border border-border bg-surface/60 px-5 py-4">
      <div
        className="relative inline-flex"
        style={{ width: STAR_COUNT * 44 }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Visual layer: a continuous gold->teal gradient clipped across
            every filled star glyph together, so the fill reads as one
            gradient sweep rather than five separately-gradiented icons. */}
        <div className="pointer-events-none flex" aria-hidden="true">
          <div
            className="flex bg-gradient-to-r from-gold to-teal bg-clip-text text-transparent"
            style={{ width: filledCount * 44 }}
          >
            {Array.from({ length: filledCount }, (_, i) => (
              <span key={i} className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl leading-none">
                ★
              </span>
            ))}
          </div>
          <div className="flex text-border" style={{ width: (STAR_COUNT - filledCount) * 44 }}>
            {Array.from({ length: STAR_COUNT - filledCount }, (_, i) => (
              <span key={i} className="flex h-11 w-11 shrink-0 items-center justify-center text-2xl leading-none">
                ★
              </span>
            ))}
          </div>
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

      <p className="mt-2 font-sans text-sm text-muted">
        {selected !== null ? (
          <>
            امتیاز شما: <span className="num text-ink">{toFaDigits(selected)}</span> از{" "}
            <span className="num">{toFaDigits(STAR_COUNT)}</span>
          </>
        ) : (
          "امتیاز شما را ثبت کنید"
        )}
      </p>

      {selected !== null && (
        <button
          type="button"
          onClick={doRemove}
          disabled={busy}
          className="mt-1 text-xs text-muted underline hover:text-gold disabled:opacity-50"
        >
          حذف رای
        </button>
      )}

      {hasError && (
        <p className="mt-2 text-xs text-gold">
          ثبت امتیاز با خطا مواجه شد. دوباره تلاش کنید.
        </p>
      )}
    </div>
  );
}
