import Link from "next/link";
import Image from "next/image";
import Constellation from "./Constellation";
import ScoreBadge from "./ScoreBadge";
import { MovieListItem } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";
import { displayTitle } from "@/lib/title";
import { entityTypeLabel } from "@/lib/constants";

export default function EntityRow({
  movie,
  rank,
}: {
  movie: MovieListItem;
  rank: number;
}) {
  // media.image_url is the standard source; poster_path is a fallback for
  // entities synced before that field existed (see entities/service.py _extract_media).
  const posterUrl =
    movie.media.image_url ??
    (movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null);

  return (
    <Link
      href={detailPathFor(movie.entity_type, movie.slug) ?? `/movies/${movie.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-surface/60 px-4 py-3 transition hover:border-gold/40 hover:bg-surface2"
    >
      <span className="num w-9 shrink-0 text-center text-lg text-muted group-hover:text-gold">
        {String(rank).padStart(2, "0")}
      </span>

      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={displayTitle(movie)}
            width={44}
            height={64}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            بدون پوستر
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium text-ink">{displayTitle(movie)}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>{entityTypeLabel(movie.entity_type)}</span>
          {movie.year && (
            <>
              <span className="opacity-50">·</span>
              <span className="num">{movie.year}</span>
            </>
          )}
        </div>
      </div>

      <Constellation year={movie.year} size={56} />

      <div className="flex flex-col items-end gap-1">
        <ScoreBadge score={movie.computed_score} />
        <span className="num text-[11px] text-muted">{movie.total_votes} رای</span>
      </div>
    </Link>
  );
}
