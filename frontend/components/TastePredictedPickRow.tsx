import Link from "next/link";
import Image from "next/image";
import { PredictedPick } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";

export default function TastePredictedPickRow({ pick }: { pick: PredictedPick }) {
  const { entity } = pick;
  const posterUrl = entity.poster_path
    ? `https://image.tmdb.org/t/p/w200${entity.poster_path}`
    : null;
  const href = detailPathFor(entity.entity_type, entity.slug);

  const content = (
    <>
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={entity.title}
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

      <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{entity.title}</p>

      {/* match_score is already 0-100 (see PredictedPicksService's docstring) --
          same convention as anchor.match_score in TasteAnchorRow. */}
      <span className="num shrink-0 text-sm text-teal">{Math.round(pick.match_score)}٪</span>
    </>
  );

  const className =
    "flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 transition hover:border-gold/40 hover:bg-surface2";

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
