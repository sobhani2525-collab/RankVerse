import Image from "next/image";
import Link from "next/link";
import { SectionHeading, RowLabel, Chip } from "@/components/list-detail/ui";
import { PEOPLE_CHIP, GENRE_CHIP, entityHref } from "@/lib/list-constellation";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { PersonSummary, GenreSummary } from "@/lib/types";

function PersonAvatar({ person, size }: { person: PersonSummary; size: "lg" | "md" }) {
  const name = person.title_fa ?? person.title;
  const dim = size === "lg" ? "h-20 w-20" : "h-16 w-16";
  const px = size === "lg" ? 80 : 64;
  return (
    <Link
      href={entityHref("person", person.slug) ?? "#"}
      className={`group flex shrink-0 flex-col items-center gap-1.5 text-center ${size === "lg" ? "w-24" : "w-20"}`}
    >
      <span
        className={`relative block ${dim} overflow-hidden rounded-full border-2 border-violet-light/40 bg-surface-2 transition group-hover:border-violet-light group-hover:shadow-[0_0_0_3px_rgba(167,139,250,0.25)]`}
      >
        {person.image_url ? (
          <Image src={person.image_url} alt={name} width={px} height={px} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold text-violet-light">
            {name.trim().charAt(0)}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-xs leading-snug text-ink">{name}</span>
      {person.role && size === "md" && <span className="line-clamp-1 text-[10px] text-muted">{person.role}</span>}
    </Link>
  );
}

interface PeopleRow {
  label: string;
  people: PersonSummary[];
}

/**
 * "این فیلم/سریال در گراف" -- the entity's own graph neighborhood (people,
 * genres, year) laid out with the same RowLabel/Chip language as the list
 * detail page's item cards, instead of the plain <dl> the hero used before.
 */
export default function EntityGraphSection({
  entityType,
  peopleRows,
  cast,
  genres,
  year,
}: {
  entityType: string;
  peopleRows: PeopleRow[];
  cast: PersonSummary[];
  genres: GenreSummary[];
  year: number | null;
}) {
  const typeFa = entityType === "tv_series" ? "سریال" : "فیلم";
  const decade = year != null ? Math.floor(year / 10) * 10 : null;

  if (peopleRows.every((row) => row.people.length === 0) && cast.length === 0 && genres.length === 0 && year == null) {
    return null;
  }

  return (
    <div>
      <SectionHeading en="OVERVIEW" fa={`نمای کلی ${typeFa}`} />
      <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-border-soft bg-surface/40 p-5">
        <RowLabel dot="bg-gold" en={entityType === "tv_series" ? "SERIES" : "MOVIE"} fa={typeFa} />

        {peopleRows.map(
          (row) =>
            row.people.length > 0 && (
              <div key={row.label} className="flex flex-col items-start gap-2">
                <RowLabel dot="bg-violet-light" en="PEOPLE" fa={row.label} />
                <div className="flex max-w-full gap-3 overflow-x-auto p-1 pb-2">
                  {row.people.map((p) => (
                    <PersonAvatar key={p.id} person={p} size="lg" />
                  ))}
                </div>
              </div>
            )
        )}

        {cast.length > 0 && (
          <div className="flex flex-col items-start gap-2">
            <RowLabel dot="bg-violet-light" en="PEOPLE" fa="بازیگران" />
            <div className="flex max-w-full gap-3 overflow-x-auto p-1 pb-2">
              {cast.map((p) => (
                <PersonAvatar key={p.id} person={p} size="md" />
              ))}
            </div>
          </div>
        )}

        {genres.length > 0 && (
          <div className="flex flex-col items-start gap-2">
            <RowLabel dot="bg-teal" en="GENRES" fa="ژانرها" />
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <Chip key={g.id} href={entityHref("genre", g.slug)} tone={GENRE_CHIP}>
                  {genreLabel(g.title)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {year != null && (
          <div className="flex flex-col items-start gap-2">
            <RowLabel dot="bg-ink-dim" en="YEAR" fa="سال" />
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="border-border bg-surface-2 font-bold tracking-[0.08em] text-ink">
                <span className="num">{toFaDigits(year)}</span>
              </Chip>
              {decade != null && (
                <Chip tone="border-border bg-surface-2 text-muted">
                  دهه <span className="num">{toFaDigits(decade)}</span>
                </Chip>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
