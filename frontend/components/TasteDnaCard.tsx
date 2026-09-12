import TasteDnaRing from "./TasteDnaRing";
import ProgressBar from "./ProgressBar";
import { TasteSnapshot, TasteDimension } from "@/lib/types";

/** "science-fiction" -> "Science Fiction" -- no Persian genre-name dictionary
 * exists on the frontend yet, so this is the "otherwise English" fallback
 * the design calls for, just made readable instead of a raw slug. */
function formatDimensionLabel(key: string): string {
  return key
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function topDimensionsSubtitle(dimensions: TasteDimension[]): string {
  const top = dimensions.slice(0, 2).map((d) => formatDimensionLabel(d.dimension_key));
  if (top.length === 0) return "";
  if (top.length === 1) return `بیشترین گرایش: ${top[0]}`;
  return `بیشترین گرایش: ${top[0]} و ${top[1]}`;
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
              <span className="w-28 shrink-0 truncate text-xs text-muted">
                {formatDimensionLabel(d.dimension_key)}
              </span>
              {/* d.score is already 0-100 (see compute.py's _score_and_confidence:
                  raw_score = 100 * (...)) -- unlike model_confidence/dimension.confidence,
                  which are 0-1 fractions. Verified against a live-seeded profile. */}
              <ProgressBar value={d.score} fillClassName="bg-gradient-to-l from-gold to-teal" />
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
