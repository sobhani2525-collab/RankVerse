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

/**
 * Isolating "top[0]" and "top[1]" SEPARATELY (e.g. each in its own <bdi>)
 * looked right in code but rendered wrong: verified with an actual
 * screenshot, "Adventure و Animation" (correct source order, Adventure
 * scored higher) came out visually as "Animation و Adventure" -- two
 * separately-isolated LTR runs joined by a neutral ("و") still get
 * reordered by the surrounding RTL paragraph, since isolation only
 * protects each run's OWN internal order, not the relative order between
 * sibling isolates. The fix is to make "X و Y" (or a single X) ONE ltr-dir
 * span so the whole fragment resolves as a single embedded run -- same
 * fix as snapshot.label below, just inline instead of a whole heading.
 */
function topDimensionsSubtitle(dimensions: TasteDimension[]) {
  const top = dimensions.slice(0, 2).map((d) => formatDimensionLabel(d.dimension_key));
  if (top.length === 0) return null;
  return (
    <>
      بیشترین گرایش: <span dir="ltr">{top.join(" و ")}</span>
    </>
  );
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
          {/* snapshot.label is a " + "-joined archetype string like
              "Sci-Fi Explorer + Story Seeker" (see compute.py's
              ARCHETYPE_MAP) -- always English, and it's the sole content of
              this heading (not embedded in a longer sentence), so dir="ltr"
              here matches the existing standalone-Latin-block convention. */}
          <h3 className="text-lg font-bold text-ink" dir="ltr">
            {snapshot.label}
          </h3>
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
                {formatDimensionLabel(d.dimension_key)}
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
