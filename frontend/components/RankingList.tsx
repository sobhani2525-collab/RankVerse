import MovieRow from "./MovieRow";
import { MovieListItem } from "@/lib/types";

export default function RankingList({ movies }: { movies: MovieListItem[] }) {
  if (movies.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
        هنوز فیلمی همگام‌سازی نشده. اولین sync را از طریق API انجام دهید.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {movies.map((movie, i) => (
        <MovieRow key={movie.id} movie={movie} rank={i + 1} />
      ))}
    </div>
  );
}
