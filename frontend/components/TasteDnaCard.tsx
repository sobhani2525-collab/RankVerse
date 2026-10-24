"use client";

import { useState } from "react";
import TasteDnaRing from "./TasteDnaRing";
import TasteReading from "./TasteReading";
import { ConfidenceHint, RatingStyle, TasteInsight, TasteSnapshot, TasteDimension } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDecimal, toFaDigits } from "@/lib/format-number";

// Rows shown before "show all": enough for the clear likes and dislikes.
const VISIBLE_ROWS = 8;
// Real deltas from 50 rarely pass +-25, so the bars scale to the profile's
// largest one -- but never below this, so near-neutral profiles stay short.
const MIN_BAR_SCALE = 15;

/**
 * How a genre compares with the platform's users, from its lift (genre-v2
 * profiles). Profiles not yet recomputed have no lift and show no line.
 */
function liftLine(d: TasteDimension): string | null {
  if (d.lift == null) return null;
  if (d.lift >= 1.15) return `${toFaDecimal(d.lift)} برابر میانگین کاربران`;
  if (d.lift <= 0.87) return "کمتر از میانگین کاربران";
  return "هم‌اندازهٔ میانگین کاربران";
}

/**
 * One genre as a bar diverging from the center (score 50 = average): to the
 * right means a stronger-than-average taste, to the left a weaker one.
 * Physical left/right on purpose -- in this RTL layout "more" grows toward
 * the reading start (right), the same way ProgressBar fills.
 */
function DivergingRow({ d, scale }: { d: TasteDimension; scale: number }) {
  const delta = Math.max(-50, Math.min(50, d.score - 50));
  const positive = delta >= 0;
  const width = `${(Math.abs(delta) / scale) * 50}%`;
  const line = liftLine(d);

  return (
    <div className="grid grid-cols-[4.5rem_1fr_2rem] sm:grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3">
      <bdi className="truncate text-xs text-ink-dim">{genreLabel(d.dimension_key)}</bdi>
      <div>
        <div className="relative h-2 rounded-full bg-surface2">
          <div className="absolute inset-y-[-3px] left-1/2 w-px bg-border" aria-hidden="true" />
          <div
            className={`absolute inset-y-0 rounded-full ${
              positive ? "bg-gradient-to-r from-teal to-gold" : "bg-gradient-to-l from-[#8A93A6]/70 to-[#C76B7E]"
            }`}
            style={positive ? { left: "50%", width } : { right: "50%", width }}
          />
        </div>
        <p className="mt-1 text-[10px] text-dim">
          {line && <>{line} · </>}
          <span className="num">{toFaDigits(d.sample_size)}</span> نشانه
        </p>
      </div>
      <span className={`num text-left text-xs font-bold ${positive ? "text-teal" : "text-muted"}`} dir="ltr">
        {delta > 0 ? "+" : ""}
        {toFaDigits(Math.round(delta))}
      </span>
    </div>
  );
}

interface TasteDnaCardProps {
  snapshot: TasteSnapshot;
  dimensions: TasteDimension[];
  /** Owner-only "N more ratings to X%" line; omitted on public profiles. */
  confidenceHint?: ConfidenceHint | null;
  insight?: TasteInsight | null;
  ratingStyle?: RatingStyle | null;
  perspective?: "self" | "other";
}

/**
 * The Taste DNA headline as one card: who the user is (confidence ring,
 * archetype, written reading, rating style) beside how each genre compares
 * with the average. Both halves live in one card so a short reading never
 * leaves a half-empty card next to a tall chart.
 */
export default function TasteDnaCard({
  snapshot,
  dimensions,
  confidenceHint,
  insight = null,
  ratingStyle = null,
  perspective = "self",
}: TasteDnaCardProps) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? dimensions : dimensions.slice(0, VISIBLE_ROWS);
  const liked = dimensions.filter((d) => d.score > 50).slice(0, 2);
  const scale = Math.max(MIN_BAR_SCALE, ...dimensions.map((d) => Math.abs(d.score - 50)));

  return (
    <div className="grid grid-cols-1 gap-8 rounded-2xl border border-border-soft bg-surface/60 p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <TasteDnaRing confidencePercent={snapshot.model_confidence * 100} size={124} centerLabel="دقت شناخت" />
          <div className="min-w-0">
            <p className="text-[11px] text-dim">تیپ سینمایی</p>
            {/* snapshot.label is a " + "-joined archetype string, e.g.
                "کاوشگر علمی-تخیلی + داستان‌جو" (compute.py's ARCHETYPE_MAP),
                named only by above-average genres. */}
            <h3 className="mt-1 text-xl font-bold leading-8 text-ink">{snapshot.label}</h3>
            {liked.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                بیشترین گرایش: {liked.map((d) => genreLabel(d.dimension_key)).join(" و ")}
              </p>
            )}
            {confidenceHint && (
              <p className="mt-2.5 text-xs text-gold">
                <span className="num">{toFaDigits(confidenceHint.ratings_needed)}</span> امتیاز دیگر تا دقت{" "}
                <span className="num">{toFaDigits(Math.round(confidenceHint.next_target * 100))}٪</span>
              </p>
            )}
          </div>
        </div>
        <TasteReading insight={insight} ratingStyle={ratingStyle} perspective={perspective} />
      </div>

      {dimensions.length > 0 && (
        <div className="lg:border-r lg:border-border-soft lg:pr-10">
          <div className="mb-3 grid grid-cols-[4.5rem_1fr_2rem] gap-3 text-[10px] text-dim sm:grid-cols-[6.5rem_1fr_2.5rem]">
            <span>ژانر</span>
            <div className="flex justify-between">
              <span>
                قوی‌تر<span className="hidden sm:inline"> از میانگین</span>
              </span>
              <span>
                ضعیف‌تر<span className="hidden sm:inline"> از میانگین</span>
              </span>
            </div>
            <span />
          </div>
          <div className="flex flex-col gap-3">
            {rows.map((d) => (
              <DivergingRow key={d.dimension_key} d={d} scale={scale} />
            ))}
          </div>
          {dimensions.length > VISIBLE_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 text-xs text-teal hover:underline"
            >
              {showAll ? "نمایش کمتر" : `نمایش همهٔ ${toFaDigits(dimensions.length)} ژانر`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
