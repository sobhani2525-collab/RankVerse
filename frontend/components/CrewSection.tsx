import Image from "next/image";
import Link from "next/link";
import { SectionHeading } from "@/components/list-detail/ui";
import { entityHref } from "@/lib/list-constellation";
import { PersonSummary } from "@/lib/types";

function PersonCircle({ person, role }: { person: PersonSummary; role: string }) {
  const name = person.title_fa ?? person.title;
  return (
    <Link
      href={entityHref("person", person.slug) ?? "#"}
      className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center sm:w-28"
    >
      <span className="relative block h-20 w-20 overflow-hidden rounded-full border border-white/10 bg-surface-2 transition duration-300 group-hover:border-gold/60 group-hover:shadow-[0_0_24px_-6px_rgba(232,179,74,0.6)] sm:h-24 sm:w-24">
        {person.image_url ? (
          <Image src={person.image_url} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl text-muted">{name.slice(0, 1)}</span>
        )}
      </span>
      <span className="line-clamp-2 text-sm font-bold leading-5 text-ink transition group-hover:text-gold">{name}</span>
      <span className="text-xs text-muted">{role}</span>
    </Link>
  );
}

/** «عوامل»: the title's directors and cast as round portraits. */
export default function CrewSection({ directors, cast }: { directors: PersonSummary[]; cast: PersonSummary[] }) {
  if (directors.length + cast.length === 0) return null;

  return (
    <section aria-label="عوامل">
      <SectionHeading en="CREW" fa="عوامل" />
      <div className="mt-4 flex gap-4 overflow-x-auto pb-2 sm:flex-wrap sm:gap-x-6 sm:gap-y-5 sm:overflow-visible">
        {directors.map((p) => (
          <PersonCircle key={`d-${p.id}`} person={p} role="کارگردان" />
        ))}
        {cast.map((p) => (
          <PersonCircle key={`c-${p.id}`} person={p} role="بازیگر" />
        ))}
      </div>
    </section>
  );
}
