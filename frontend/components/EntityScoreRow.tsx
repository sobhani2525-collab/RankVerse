import { MonoLabel } from "@/components/list-detail/ui";
import { toFaDigits } from "@/lib/format-number";
import StarRating, { RatableEntity } from "@/components/rating/StarRating";

/**
 * Movie/tv-series hero's score panel: one bordered card with SCORE / IMDb /
 * "YOUR RATING" divided into columns (rows on mobile), matching the list
 * detail page's "SCORE" block style (list-detail/ListNodeItem.tsx) -- a
 * mono English kicker over a big bold number -- instead of the small
 * rounded pills (ScoreBadge/ImdbBadge) used elsewhere (EntityRow,
 * SuggestedBattleCard).
 */
export default function EntityScoreRow({
  score,
  imdbId,
  imdbRating,
  imdbVotes,
  ratingEntity,
}: {
  score: number | null;
  imdbId: string | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  ratingEntity: RatableEntity;
}) {
  const hasRating = typeof ratingEntity.total_votes === "number";
  if (score == null && imdbRating == null && !hasRating) return null;

  return (
    <div className="mt-5 flex flex-col overflow-hidden rounded-2xl border border-border sm:flex-row sm:items-stretch">
      {score != null && (
        <div className="flex flex-col items-start gap-1 border-b border-border p-4 sm:border-b-0 sm:border-e sm:p-5">
          <MonoLabel size="text-[10px]" className="text-dim">
            SCORE
          </MonoLabel>
          <span className="num text-3xl font-extrabold leading-tight text-ink">
            {toFaDigits(score.toFixed(1))}
          </span>
          <span className="text-xs text-muted">امتیاز ترکیبی</span>
        </div>
      )}

      {imdbRating != null && (
        <div className="flex flex-col items-start gap-1 border-b border-border p-4 sm:border-b-0 sm:border-e sm:p-5">
          <MonoLabel size="text-[10px]" className="text-gold">
            IMDb
          </MonoLabel>
          {imdbId ? (
            <a
              href={`https://www.imdb.com/title/${imdbId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="num text-3xl font-extrabold leading-tight text-ink transition hover:text-gold"
            >
              {toFaDigits(imdbRating.toFixed(1))}
            </a>
          ) : (
            <span className="num text-3xl font-extrabold leading-tight text-ink">
              {toFaDigits(imdbRating.toFixed(1))}
            </span>
          )}
          {imdbVotes != null && (
            <span className="num text-xs text-muted">{imdbVotes.toLocaleString("fa-IR")} رأی</span>
          )}
        </div>
      )}

      {hasRating && (
        <div className="flex flex-1 flex-col items-start gap-2 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <MonoLabel size="text-[10px]" className="text-dim">
              YOUR RATING
            </MonoLabel>
            <span className="text-xs text-muted">رأی شما</span>
          </div>
          <StarRating entity={ratingEntity} bare />
        </div>
      )}
    </div>
  );
}
