import Link from "next/link";
import EntityHero from "@/components/EntityHero";
import EntityDescription from "@/components/EntityDescription";
import MediaPlayer from "@/components/MediaPlayer";
import RelatedList from "@/components/RelatedList";
import { GenreDetail } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";

// Movies and tv_series both belong under one genre ranking -- merged into a
// single list (sorted by score, nulls last) rather than two separate
// sections, since EntityRow's "سریال" badge already tells them apart per row.
function byScoreDesc(a: { computed_score: number | null }, b: { computed_score: number | null }) {
  if (a.computed_score === null) return b.computed_score === null ? 0 : 1;
  if (b.computed_score === null) return -1;
  return b.computed_score - a.computed_score;
}

export default function GenreView({ data }: { data: GenreDetail }) {
  const items = [...data.movies, ...data.tv_series].sort(byScoreDesc);

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <EntityHero
        title={`بهترین‌های ${genreLabel(data.title)}`}
        subtitle={`${items.length} عنوان`}
        media={data.media}
      />
      <MediaPlayer media={data.media} />
      <EntityDescription text={data.description} />
      <RelatedList items={items} />
    </main>
  );
}
