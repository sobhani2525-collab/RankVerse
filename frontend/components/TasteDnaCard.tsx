"use client";

import { useState } from "react";
import TasteDnaRing from "./TasteDnaRing";
import TasteReading from "./TasteReading";
import { ConfidenceHint, RatingStyle, TasteInsight, TasteSnapshot, TasteDimension } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

// Rows shown before "show all": enough for the clear likes and dislikes.
const VISIBLE_ROWS = 8;
type Perspective = "self" | "other";

// Score bands for the verdict word (50 = neutral, see TasteDimensionComputer).
const LOVE_SCORE = 62;
const LIKE_SCORE = 54;
const MEH_SCORE = 46;
// Bars stretch this score range across the track: real scores sit around
// 30-70, and a 0-100 track made every bar look about the same.
const BAR_MIN = 25;
const BAR_MAX = 75;

const VERDICTS: Record<Perspective, [string, string, string, string]> = {
  self: ["عاشقشی", "دوستش داری", "معمولی", "کمتر به دلت می‌شینه"],
  other: ["عاشقشه", "دوستش داره", "معمولی", "کمتر به دلش می‌شینه"],
};
const VERDICT_STYLES = [
  { chip: "border-gold/40 bg-gold/10 text-gold", bar: "from-gold/70 to-gold" },
  { chip: "border-teal/40 bg-teal/10 text-teal", bar: "from-teal/60 to-teal" },
  { chip: "border-border bg-white/[0.03] text-muted", bar: "from-[#8A93A6]/40 to-[#8A93A6]/70" },
  { chip: "border-[#C76B7E]/40 bg-[#C76B7E]/10 text-[#C76B7E]", bar: "from-[#C76B7E]/50 to-[#C76B7E]/80" },
];

function verdictIndex(score: number): number {
  if (score >= LOVE_SCORE) return 0;
  if (score >= LIKE_SCORE) return 1;
  if (score >= MEH_SCORE) return 2;
  return 3;
}

/**
 * One plain sentence joining the score's two halves -- how much the user
 * prefers the genre (affinity) and how often they pick it compared with
 * other users (lift) -- so the two never read as contradicting numbers
 * side by side. Profiles not yet recomputed have neither and get none.
 */
function genreSentence(d: TasteDimension, p: Perspective): string | null {
  if (d.affinity == null) return null;
  const likes = d.affinity >= 0.58 ? 1 : d.affinity <= 0.42 ? -1 : 0;
  const picks = d.lift == null ? 0 : d.lift >= 1.25 ? 1 : d.lift <= 0.8 ? -1 : 0;
  const self = p === "self";
  if (likes === 1 && picks === 1) return self ? "زیاد سراغش می‌ری و راضی‌ات می‌کنه" : "زیاد سراغش می‌ره و راضی‌اش می‌کنه";
  if (likes === 1 && picks === -1)
    return self ? "کمتر سراغش می‌ری، ولی وقتی می‌بینی دوستش داری" : "کمتر سراغش می‌ره، ولی وقتی می‌بینه دوستش داره";
  if (likes === 1) return "در امتیازها و نبردها معمولاً برنده‌ست";
  if (likes === -1 && picks === 1) return self ? "زیاد می‌بینی، ولی کمتر راضی‌ات می‌کنه" : "زیاد می‌بینه، ولی کمتر راضی‌اش می‌کنه";
  if (likes === -1) return "در امتیازها و نبردها معمولاً می‌بازه";
  if (picks === 1) return self ? "بیشتر از بقیهٔ کاربران سراغش می‌ری" : "بیشتر از بقیهٔ کاربران سراغش می‌ره";
  if (picks === -1) return self ? "کمتر از بقیهٔ کاربران سراغش می‌ری" : "کمتر از بقیهٔ کاربران سراغش می‌ره";
  // Neither half stands out: follow the verdict so the two never disagree.
  if (d.score >= LIKE_SCORE) return self ? "کمی بیشتر از بقیهٔ ژانرها به دلت می‌شینه" : "کمی بیشتر از بقیهٔ ژانرها به دلش می‌شینه";
  if (d.score < MEH_SCORE) return self ? "کمی کمتر از بقیهٔ ژانرها به دلت می‌شینه" : "کمی کمتر از بقیهٔ ژانرها به دلش می‌شینه";
  return self ? "نظرت درباره‌اش معمولیه" : "نظرش درباره‌اش معمولیه";
}

function GenreRow({ d, perspective }: { d: TasteDimension; perspective: Perspective }) {
  const v = verdictIndex(d.score);
  const style = VERDICT_STYLES[v];
  const width = Math.max(4, Math.min(100, ((d.score - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));
  const sentence = genreSentence(d, perspective);

  return (
    <div title={`بر پایهٔ ${toFaDigits(d.sample_size)} امتیاز، ♥ و رأی نبرد`}>
      <div className="flex items-center gap-3">
        <bdi className="w-20 shrink-0 truncate text-sm font-semibold text-ink sm:w-24">{genreLabel(d.dimension_key)}</bdi>
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface2">
          {/* Fills from the reading start (right), like ProgressBar. */}
          <div className={`ms-0 h-full rounded-full bg-gradient-to-l ${style.bar}`} style={{ width: `${width}%` }} />
        </div>
        {/* Fixed width so every row's bar track has the same length. */}
        <span className={`w-[7.5rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-center text-[11px] ${style.chip}`}>
          {VERDICTS[perspective][v]}
        </span>
      </div>
      {sentence && <p className="mt-1 pr-[5.75rem] text-[11px] text-dim sm:pr-[6.75rem]">{sentence}</p>}
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
          <p className="mb-4 text-xs text-muted">
            {perspective === "self" ? "ژانرهای سلیقه‌ات، از بیشترین به کمترین" : "ژانرهای سلیقه‌اش، از بیشترین به کمترین"}
          </p>
          <div className="flex flex-col gap-3.5">
            {rows.map((d) => (
              <GenreRow key={d.dimension_key} d={d} perspective={perspective} />
            ))}
          </div>
          {dimensions.length > VISIBLE_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-4 text-xs font-semibold text-gold hover:underline"
            >
              {showAll ? "نمایش کمتر" : `نمایش همه (${toFaDigits(dimensions.length)})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
