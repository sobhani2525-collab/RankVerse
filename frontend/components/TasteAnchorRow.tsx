import Link from "next/link";
import Image from "next/image";
import { TasteAnchor } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";
import { entityTypeLabel } from "@/lib/constants";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";

const STRENGTH_LABELS: Record<string, string> = {
  primary: "محور اصلی",
  strong_signal: "سیگنال قوی",
};

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

        {/* match_score is already 0-100 (compute.py: round(100 * anchor_score)),
            unlike model_confidence which is a 0-1 fraction -- verified live. */}
        <div className="num absolute right-2 top-2 rounded-full border border-teal/40 bg-bg/80 px-2 py-0.5 text-[11px] font-bold text-teal backdrop-blur-sm">
          {toFaDigits(Math.round(anchor.match_score))}٪
        </div>
      </div>

      <div className="mt-2.5 min-w-0">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">{entityTypeLabel(entity.entity_type)}</span>
          <span className="inline-block rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold">
            {STRENGTH_LABELS[anchor.anchor_strength] ?? anchor.anchor_strength}
          </span>
        </div>
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
