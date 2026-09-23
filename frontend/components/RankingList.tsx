import EntityRow from "./EntityRow";
import { MovieListItem } from "@/lib/types";

// startRank offsets the numbering for paged lists (e.g. page 2 starts at 26).
export default function RankingList({ movies, startRank = 1 }: { movies: MovieListItem[]; startRank?: number }) {
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
        <EntityRow key={movie.id} movie={movie} rank={startRank + i} />
      ))}
    </div>
  );
}
