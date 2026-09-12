import TasteDnaRing from "./TasteDnaRing";
import ProgressBar from "./ProgressBar";
import { TasteSnapshot, TasteDimension } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";

/**
 * Genre labels are now Persian (via genreLabel), so joining "top[0]" and
 * "top[1]" is plain same-direction RTL text -- no bidi run-ordering risk
 * the way the old English "Adventure و Animation" version had (that bug
 * needed the whole "X و Y" fragment forced into one dir="ltr" span; here
 * there's no foreign-direction run to isolate at all).
 */
function topDimensionsSubtitle(dimensions: TasteDimension[]) {
  const top = dimensions.slice(0, 2).map((d) => genreLabel(d.dimension_key));
  if (top.length === 0) return null;
  return <>بیشترین گرایش: {top.join(" و ")}</>;
}

interface TasteDnaCardProps {
  snapshot: TasteSnapshot;
  dimensions: TasteDimension[];
}

export default function TasteDnaCard({ snapshot, dimensions }: TasteDnaCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <div className="flex items-center gap-5">
        <TasteDnaRing confidencePercent={snapshot.model_confidence * 100} />
        <div className="min-w-0">
          {/* snapshot.label is a " + "-joined archetype string, e.g.
              "کاوشگر علمی-تخیلی + داستان‌جو" (see compute.py's
              ARCHETYPE_MAP, now Persian) -- plain RTL text, so no dir
              override is needed here anymore. */}
          <h3 className="text-lg font-bold text-ink">{snapshot.label}</h3>
          {dimensions.length > 0 && (
            <p className="mt-1 text-xs text-muted">{topDimensionsSubtitle(dimensions)}</p>
          )}
        </div>
      </div>

      {dimensions.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {dimensions.map((d) => (
            <div key={d.dimension_key} className="flex items-center gap-3">
              <bdi className="w-28 shrink-0 truncate text-xs text-muted">
                {genreLabel(d.dimension_key)}
              </bdi>
              <div className="min-w-0 flex-1">
                {/* d.score is already 0-100 (see compute.py's _score_and_confidence:
                    raw_score = 100 * (...)) -- unlike model_confidence/dimension.confidence,
                    which are 0-1 fractions. Verified against a live-seeded profile. */}
                <ProgressBar value={d.score} fillClassName="bg-gradient-to-l from-gold to-teal" />
                <p className="mt-1 text-[10px] text-muted">
                  بر اساس <span className="num">{d.sample_size}</span> رأی
                </p>
              </div>
              <span className="num w-10 shrink-0 text-left text-xs text-ink">
                {Math.round(d.score)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
