import { SectionHeading, RowLabel, Chip } from "@/components/list-detail/ui";
import { PEOPLE_CHIP, GENRE_CHIP, entityHref } from "@/lib/list-constellation";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";
import { PersonSummary, GenreSummary } from "@/lib/types";

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
      <SectionHeading en="GRAPH" fa={`این ${typeFa} در گراف`} />
      <div className="mt-4 flex flex-col gap-5 rounded-2xl border border-border-soft bg-surface/40 p-5">
        <RowLabel dot="bg-gold" en={entityType === "tv_series" ? "SERIES" : "MOVIE"} fa={typeFa} />

        {peopleRows.map(
          (row) =>
            row.people.length > 0 && (
              <div key={row.label} className="flex flex-col items-start gap-2">
                <RowLabel dot="bg-violet-light" en="PEOPLE" fa={row.label} />
                <div className="flex flex-wrap gap-1.5">
                  {row.people.map((p) => (
                    <Chip key={p.id} href={entityHref("person", p.slug)} tone={PEOPLE_CHIP} ltr>
                      {p.title}
                    </Chip>
                  ))}
                </div>
              </div>
            )
        )}

        {cast.length > 0 && (
          <div className="flex flex-col items-start gap-2">
            <RowLabel dot="bg-violet-light" en="PEOPLE" fa="بازیگران" />
            <div className="flex flex-wrap gap-1.5">
              {cast.map((p) => (
                <Chip key={p.id} href={entityHref("person", p.slug)} tone={PEOPLE_CHIP} ltr>
                  {p.title}
                </Chip>
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
