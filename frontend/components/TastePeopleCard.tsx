import Link from "next/link";
import Image from "next/image";
import { MonoLabel } from "@/components/list-detail/ui";
import { TastePerson } from "@/lib/types";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";

function PersonRow({ person }: { person: TastePerson }) {
  const { entity } = person;
  const name = entity.title_fa || entity.title;
  const href = detailPathFor("person", entity.slug) ?? "#";
  const photo = entity.profile_path ? `https://image.tmdb.org/t/p/w185${entity.profile_path}` : null;

  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.03]">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-surface2">
        {photo ? (
          <Image src={photo} alt={name} fill sizes="40px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm text-muted">{name.charAt(0)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <bdi className="block truncate text-right text-sm font-semibold text-ink transition group-hover:text-gold">{name}</bdi>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface2">
            <div className="h-full rounded-full bg-gold/70" style={{ width: `${person.score}%` }} />
          </div>
          <span className="shrink-0 text-[10px] text-dim">
            <span className="num">{toFaDigits(person.sample_size)}</span> اثر محبوب
          </span>
        </div>
      </div>
    </Link>
  );
}

function Column({ title, people }: { title: string; people: TastePerson[] }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-bold text-muted">{title}</h4>
      {people.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {people.map((p) => (
            <PersonRow key={p.entity.id} person={p} />
          ))}
        </div>
      ) : (
        <p className="px-2 text-xs leading-6 text-dim">هنوز کسی با دست‌کم دو اثر محبوب پیدا نشده.</p>
      )}
    </div>
  );
}

/** Directors and lead actors behind the titles a user likes (TasteFacetComputer). */
export default function TastePeopleCard({ directors, actors }: { directors: TastePerson[]; actors: TastePerson[] }) {
  if (directors.length === 0 && actors.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border-soft bg-surface/60 p-6">
      <MonoLabel size="text-[10px]">FAVORITE PEOPLE</MonoLabel>
      <h3 className="mt-1 text-base font-bold text-ink">آدم‌های محبوب</h3>
      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Column title="کارگردان‌ها" people={directors.slice(0, 5)} />
        <Column title="بازیگرها" people={actors.slice(0, 5)} />
      </div>
    </div>
  );
}
