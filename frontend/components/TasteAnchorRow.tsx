import Link from "next/link";
import Image from "next/image";
import { TasteAnchor } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";
import { entityTypeLabel } from "@/lib/constants";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import CardTitle from "@/components/entities/card-title";

/**
 * Poster tile (not a list row) so a handful of anchors reads as a small
 * gallery -- matches the poster-grid language used everywhere else an
 * entity is shown (PosterCard/EntityCard), instead of a cramped list.
 */
export default function TasteAnchorRow({ anchor }: { anchor: TasteAnchor }) {
  const { entity } = anchor;
  // Unlike MovieListItem, TasteAnchorEntity (app/modules/taste/schemas.py)
  // has no `media` field at all -- TasteService builds it straight from
  // Entity.attributes.get("poster_path") with nothing else -- so there's no
  // media.image_url to fall back from here; poster_path is the only source.
  const posterUrl = entity.poster_path
    ? `https://image.tmdb.org/t/p/w200${entity.poster_path}`
    : null;
  const href = detailPathFor(entity.entity_type, entity.slug);
  const title = displayTitle(entity);

  const content = (
    <>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface2 transition group-hover:border-gold/40">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 33vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            بدون پوستر
          </div>
        )}

        {/* The user's own rating, not anchor.match_score: an internal blend of
            rating and graph centrality that read as a confusing percentage. */}
        {anchor.user_rating != null && (
          <div
            className="num absolute right-2 top-2 rounded-full border border-gold/40 bg-bg/80 px-2 py-0.5 text-[11px] font-bold text-gold backdrop-blur-sm"
            aria-label={`امتیاز: ${anchor.user_rating} از ۵`}
          >
            ★ {toFaDigits(anchor.user_rating)}
          </div>
        )}
      </div>

      <div className="mt-2.5 min-w-0">
        <p className="text-sm font-medium text-ink">
          <CardTitle entity={entity} className="truncate" />
        </p>
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
