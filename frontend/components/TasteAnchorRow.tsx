import Link from "next/link";
import Image from "next/image";
import { TasteAnchor } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";

const STRENGTH_LABELS: Record<string, string> = {
  primary: "محور اصلی",
  strong_signal: "سیگنال قوی",
};

export default function TasteAnchorRow({ anchor }: { anchor: TasteAnchor }) {
  const { entity } = anchor;
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

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{entity.title}</p>
        <span className="mt-1 inline-block rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold">
          {STRENGTH_LABELS[anchor.anchor_strength] ?? anchor.anchor_strength}
        </span>
      </div>

      {/* match_score is already 0-100 (compute.py: round(100 * anchor_score)),
          unlike model_confidence which is a 0-1 fraction -- verified live. */}
      <span className="num shrink-0 text-sm text-teal">{Math.round(anchor.match_score)}٪</span>
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
