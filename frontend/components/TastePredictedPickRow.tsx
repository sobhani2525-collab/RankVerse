import Link from "next/link";
import Image from "next/image";
import { PredictedPick } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";
import { entityTypeLabel } from "@/lib/constants";
import { toFaDigits } from "@/lib/format-number";

/**
 * Poster tile (not a list row) -- same gallery treatment as TasteAnchorRow
 * so predicted picks read as a small poster wall, not a squeezed list.
 */
export default function TastePredictedPickRow({ pick }: { pick: PredictedPick }) {
  const { entity } = pick;
  const posterUrl = entity.poster_path
    ? `https://image.tmdb.org/t/p/w200${entity.poster_path}`
    : null;
  const href = detailPathFor(entity.entity_type, entity.slug);

  const content = (
    <>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface2 transition group-hover:border-gold/40">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={entity.title}
            fill
            sizes="(max-width: 768px) 33vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            بدون پوستر
          </div>
        )}

        {/* match_score is already 0-100 (see PredictedPicksService's docstring) --
            same convention as anchor.match_score in TasteAnchorRow. */}
        <div className="num absolute right-2 top-2 rounded-full border border-teal/40 bg-bg/80 px-2 py-0.5 text-[11px] font-bold text-teal backdrop-blur-sm">
          {toFaDigits(Math.round(pick.match_score))}٪
        </div>
      </div>

      <div className="mt-2.5 min-w-0">
        <p className="truncate text-sm font-medium text-ink">{entity.title}</p>
        <p className="mt-1 text-[11px] text-muted">{entityTypeLabel(entity.entity_type)}</p>
      </div>
    </>
  );

  const className = "group flex flex-col";

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
