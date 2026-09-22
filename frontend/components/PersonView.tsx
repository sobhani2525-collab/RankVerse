import Image from "next/image";
import Link from "next/link";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import MediaPlayer from "@/components/MediaPlayer";
import EntityDescription from "@/components/EntityDescription";
import RelatedList from "@/components/RelatedList";
import RelatedEntities from "@/components/RelatedEntities";
import EntityLists from "@/components/EntityLists";
import { getRelatedEntities, RelatedEntity } from "@/lib/api";
import { PersonDetail } from "@/lib/types";

export default async function PersonView({ data }: { data: PersonDetail }) {
  let related: RelatedEntity[] = [];
  try {
    related = await getRelatedEntities(data.id);
  } catch {
    related = [];
  }

  const posterUrl = data.media?.image_url ?? null;
  const personEntity = { id: data.id, slug: data.slug, entity_type: "person" };

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {posterUrl && (
          // Same treatment as the movie/tv-series hero poster -- deliberately
          // bigger than any related-entity card so it reads as the primary
          // image on the page.
          <div className="h-96 w-64 shrink-0 overflow-hidden rounded-xl bg-surface2 sm:mx-0 mx-auto">
            <Image
              src={posterUrl}
              alt={data.title}
              width={256}
              height={384}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="max-w-3xl flex-1">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-2xl text-ink">{data.title}</h1>
            <div className="flex shrink-0 items-center gap-2">
              <DetailFavoriteButton entity={personEntity} size={44} />
              <DetailShareButton entity={personEntity} title={data.title} size={44} />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <AddToListMenu entity={personEntity} />
          </div>

          <MediaPlayer media={data.media} />
          <EntityDescription text={data.biography} />
        </div>
      </div>

      <div className="mt-10">
        <RelatedEntities items={related} />
      </div>

      {/* Movie/tv-series credits use the same poster-card grid as the home
          page; tracks/albums aren't "فیلم و سریال" so they keep the
          compact ranked-row layout, in its own readable column. */}
      <RelatedList title="کارگردانی‌ها" items={data.directed} display="cards" />
      <RelatedList title="ساخته‌ها" items={data.created} display="cards" />
      <RelatedList title="بازیگری‌ها" items={data.acted_in} display="cards" />

      <div className="max-w-3xl">
        <RelatedList title="آهنگ‌ها" items={data.tracks} />
        <RelatedList title="آلبوم‌ها" items={data.albums} />
      </div>

      <EntityLists entityId={data.id} />
    </main>
  );
}
