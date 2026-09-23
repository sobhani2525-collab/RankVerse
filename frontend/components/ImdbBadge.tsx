import { toFaDigits } from "@/lib/format-number";

/** IMDb rating from IMDb's own dataset (see scripts/sync_imdb_ratings.py). */
export default function ImdbBadge({
  imdbId,
  rating,
  votes,
}: {
  imdbId: string | null;
  rating: number | null;
  votes: number | null;
}) {
  if (rating == null) return null;

  const content = (
    <>
      <span className="rounded bg-gold px-1 text-[10px] font-bold leading-4 text-bg" dir="ltr">
        IMDb
      </span>
      <span className="num font-medium text-ink">{toFaDigits(rating.toFixed(1))}</span>
      {votes != null && (
        <span className="num text-xs text-muted">({votes.toLocaleString("fa-IR")} رأی)</span>
      )}
    </>
  );
  const className =
    "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-2.5 py-1 text-sm";

  return imdbId ? (
    <a
      href={`https://www.imdb.com/title/${imdbId}/`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} hover:border-gold/60`}
    >
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}
