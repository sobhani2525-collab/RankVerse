import Image from "next/image";
import Link from "next/link";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import MediaPlayer from "@/components/MediaPlayer";
import EntityDescription from "@/components/EntityDescription";
import RelatedList from "@/components/RelatedList";
import RelatedEntities from "@/components/RelatedEntities";
import PersonCard from "@/components/PersonCard";
import { MonoLabel, SectionHeading } from "@/components/list-detail/ui";
import EntityLists from "@/components/EntityLists";
import EntityComments from "@/components/entities/entity-comments";
import PersonBattle from "@/components/PersonBattle";
import { getRelatedEntities, RelatedEntity } from "@/lib/api";
import { PersonDetail } from "@/lib/types";
import { displayTitle } from "@/lib/title";

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
        {/* Same hero photo block as the movie page. */}
        <div className="h-[330px] w-[220px] sm:h-[480px] sm:w-80 shrink-0 overflow-hidden rounded-xl bg-surface2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={data.title_fa ?? data.title}
              width={320}
              height={480}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              بدون تصویر
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold">
                  <span className="h-2 w-2 rounded-full bg-gold" />
                </span>
                <div className="flex flex-col gap-0.5 leading-none">
                  <MonoLabel size="text-[10px]" className="text-gold">
                    PERSON
                  </MonoLabel>
                  <span className="text-xs text-muted">هنرمند</span>
                </div>
              </div>

              <h1 className="text-[30px] font-black leading-[1.35] text-ink lg:text-[56px] lg:leading-[1.2]">
                {data.title_fa ?? data.title}.
              </h1>
              {data.title_fa && (
                <p dir="ltr" className="block text-right text-2xl font-black leading-[1.2] text-dim lg:text-[44px]">
                  {data.title}.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DetailFavoriteButton entity={personEntity} size={48} shape="square" />
              <DetailShareButton entity={personEntity} title={displayTitle(data)} size={48} shape="square" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AddToListMenu entity={personEntity} />
          </div>

          <MediaPlayer media={data.media} />
          <EntityDescription text={data.biography} />
        </div>
      </div>

      <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-14">
        <div className="min-w-0 flex-1">
          <div className="mt-14">
            <RelatedEntities items={related} tone="text-gold" />
          </div>

          {/* Movie/tv-series credits use the same poster-card grid as the
              movie page; tracks/albums aren't "فیلم و سریال" so they keep
              the compact ranked-row layout. */}
          <RelatedList title="کارگردانی‌ها" en="DIRECTED" items={data.directed} display="cards" />
          <RelatedList title="ساخته‌ها" en="CREATED" items={data.created} display="cards" />
          <RelatedList title="بازیگری‌ها" en="ACTED IN" items={data.acted_in} display="cards" />

          <RelatedList title="آهنگ‌ها" en="TRACKS" items={data.tracks} />
          <RelatedList title="آلبوم‌ها" en="ALBUMS" items={data.albums} />

          {(data.related_people?.length ?? 0) > 0 && (
            <div className="mt-14">
              <SectionHeading en="RELATED PEOPLE" fa="هنرمندان مرتبط" tone="text-gold" />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-4">
                {data.related_people?.map((p) => (
                  <PersonCard key={p.id} person={p} hideWorks />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Same side column as the list page: battle, lists, comments. */}
        <aside className="flex shrink-0 flex-col gap-10 lg:mt-14 lg:w-[380px] lg:gap-7">
          <PersonBattle directed={data.directed} created={data.created} actedIn={data.acted_in} />
          <EntityLists entityId={data.id} variant="sidebar" />
          <EntityComments entityId={data.id} />
        </aside>
      </div>
    </main>
  );
}
