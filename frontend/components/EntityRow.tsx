import Link from "next/link";
import Image from "next/image";
import Constellation from "./Constellation";
import ScoreBadge from "./ScoreBadge";
import { MovieListItem } from "@/lib/types";

// entity_type -> route prefix. Every entity_type that can appear in a
// MovieListItem-shaped list (movie, tv_series) needs an entry here so a
// mixed list (a person's filmography, a genre page) links each row correctly.
const DETAIL_PATH_BY_TYPE: Record<string, string> = {
  movie: "/movies",
  tv_series: "/tv-series",
};

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

  const basePath = DETAIL_PATH_BY_TYPE[movie.entity_type] ?? "/movies";
  const isTvSeries = movie.entity_type === "tv_series";

  return (
    <Link
      href={`${basePath}/${movie.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-surface/60 px-4 py-3 transition hover:border-gold/40 hover:bg-surface2"
    >
      <span className="num w-9 shrink-0 text-center text-lg text-muted group-hover:text-gold">
        {String(rank).padStart(2, "0")}
      </span>

      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={movie.title}
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
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium text-ink">{movie.title}</h3>
          {isTvSeries && (
            <span className="num shrink-0 rounded-full border border-teal/40 bg-teal/10 px-1.5 py-0.5 text-[10px] text-teal">
              سریال
            </span>
          )}
        </div>
        {movie.year && <p className="num text-xs text-muted">{movie.year}</p>}
      </div>

      <Constellation year={movie.year} size={56} />

      <div className="flex flex-col items-end gap-1">
        <ScoreBadge score={movie.computed_score} />
        <span className="num text-[11px] text-muted">{movie.total_votes} رای</span>
      </div>
    </Link>
  );
}
