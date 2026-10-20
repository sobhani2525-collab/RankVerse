import { displayTitle } from "@/lib/title";
import { posterSrc, TournamentEntity } from "@/lib/tournament";

/** A poster tile (2:3) with the title as a fallback when there is no image. */
export default function Poster({
  entity,
  className = "",
  size = "w342",
}: {
  entity: Pick<TournamentEntity, "title" | "title_fa" | "poster_url">;
  className?: string;
  size?: "w185" | "w342";
}) {
  const src = posterSrc(entity, size);
  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-surface2 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={displayTitle(entity)} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted">
          {displayTitle(entity)}
        </div>
      )}
    </div>
  );
}
