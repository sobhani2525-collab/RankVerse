import Link from "next/link";
import Image from "next/image";
import Constellation from "./Constellation";
import ScoreBadge from "./ScoreBadge";
import { MovieListItem } from "@/lib/types";

export default function MovieRow({
  movie,
  rank,
}: {
  movie: MovieListItem;
  rank: number;
}) {
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
    : null;

  return (
    <Link
      href={`/movies/${movie.slug}`}
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
        <h3 className="truncate font-medium text-ink">{movie.title}</h3>
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
