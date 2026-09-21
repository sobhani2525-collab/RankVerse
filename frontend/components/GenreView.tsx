import Link from "next/link";
import EntityHero from "@/components/EntityHero";
import EntityDescription from "@/components/EntityDescription";
import MediaPlayer from "@/components/MediaPlayer";
import FavoriteEntityCard from "@/components/entities/favorite-entity-card";
import EntityLists from "@/components/EntityLists";
import { GenreDetail } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";
import { movieListItemToEntityCard } from "@/lib/entity-card-adapters";
import { toFaDigits } from "@/lib/format-number";

// Movies and tv_series both belong under one genre ranking -- merged into a
// single list (sorted by score, nulls last) rather than two separate
// sections, since EntityCard's type label already tells them apart per card.
function byScoreDesc(a: { computed_score: number | null }, b: { computed_score: number | null }) {
  if (a.computed_score === null) return b.computed_score === null ? 0 : 1;
  if (b.computed_score === null) return -1;
  return b.computed_score - a.computed_score;
}

export default function GenreView({ data }: { data: GenreDetail }) {
  const items = [...data.movies, ...data.tv_series].sort(byScoreDesc);

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <EntityHero
        title={`بهترین‌های ${genreLabel(data.title)}`}
        subtitle={`${toFaDigits(items.length)} عنوان`}
        media={data.media}
      />
      <MediaPlayer media={data.media} />
      <EntityDescription text={data.description} />

      {items.length > 0 && (
        <section className="mt-10">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
            {items.map((item) => (
              <FavoriteEntityCard key={item.id} entity={movieListItemToEntityCard(item)} />
            ))}
          </div>
        </section>
      )}

      <EntityLists entityId={data.id} />
    </main>
  );
}
