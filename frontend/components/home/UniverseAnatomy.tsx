import Link from "next/link";
import Reveal from "./Reveal";
import { HomeTitle } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

interface Layer {
  kicker: string;
  label: string;
  values: { text: string; href?: string; num?: boolean }[];
  tone: string;
}

/**
 * "Movies aren't lists": unfolds one real title (the current #1) layer by
 * layer -- film, people, genres, year, relationships, rank -- so the
 * knowledge graph is shown on an actual record instead of described.
 * Layers whose data didn't load are dropped rather than filled in.
 */
export default function UniverseAnatomy({ title }: { title: HomeTitle }) {
  const people = [...title.directors.slice(0, 1), ...title.cast.slice(0, 3)];
  const relationCount = title.directors.length + title.cast.length + title.genres.length;

  const layers: Layer[] = [
    {
      kicker: "Movie",
      label: "فیلم",
      values: [{ text: displayTitle(title), href: `/movies/${title.slug}` }],
      tone: "border-gold/40 text-gold",
    },
    {
      kicker: "People",
      label: "آدم‌ها",
      values: people.map((p) => ({ text: p.title, href: `/person/${p.slug}` })),
      tone: "border-violet-soft/40 text-violet-soft",
    },
    {
      kicker: "Genres",
      label: "ژانرها",
      values: title.genres.map((g) => ({ text: genreLabel(g.title), href: `/genre/${g.slug}` })),
      tone: "border-teal/40 text-teal",
    },
    {
      kicker: "Year",
      label: "سال",
      values: title.year ? [{ text: toFaDigits(title.year), num: true }] : [],
      tone: "border-border text-ink-dim",
    },
    {
      kicker: "Relationships",
      label: "اتصال‌ها",
      values: title.hasDetail ? [{ text: `${toFaDigits(relationCount)} اتصال مستقیم در گراف` }] : [],
      tone: "border-border text-ink-dim",
    },
    {
      kicker: "Ranking",
      label: "رتبه",
      values: [
        { text: `#${toFaDigits(title.rank)}`, num: true },
        ...(title.score !== null ? [{ text: `امتیاز ${toFaDigits(title.score.toFixed(1))}` }] : []),
      ],
      tone: "border-gold/40 text-gold",
    },
  ].filter((l) => l.values.length > 0);

  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24">
      <Reveal>
        <p className="kicker text-teal/80">Movies aren&apos;t lists. They&apos;re universes.</p>
        <h2 className="font-display mt-4 text-4xl leading-tight text-ink sm:text-6xl">
          فیلم‌ها لیست نیستند.
          <br />
          <span className="text-muted">جهان‌اند.</span>
        </h2>
      </Reveal>

      <ol className="relative mt-14 grid gap-4 lg:grid-cols-6 lg:gap-3">
        {/* The spine that links the layers: vertical on mobile, horizontal on desktop. */}
        <span aria-hidden="true" className="absolute bottom-6 right-[11px] top-6 w-px bg-gradient-to-b from-gold/60 via-violet/40 to-teal/40 lg:bottom-auto lg:left-6 lg:right-6 lg:top-[11px] lg:h-px lg:w-auto lg:bg-gradient-to-l" />
        {layers.map((layer, i) => (
          <li key={layer.kicker} className="relative">
            <Reveal delay={i * 120} className="flex gap-4 lg:flex-col lg:gap-5">
              <span className={`relative z-10 mt-1 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border bg-bg lg:mt-0 ${layer.tone}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
              <div className="min-w-0 pb-2">
                <p className="kicker text-muted/70">{layer.kicker}</p>
                <p className="mt-1 text-sm text-muted">{layer.label}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {layer.values.map((v) =>
                    v.href ? (
                      <Link
                        key={v.text}
                        href={v.href}
                        className={`max-w-full truncate rounded-full border bg-surface/40 px-3 py-1 text-xs transition hover:bg-surface2 ${layer.tone}`}
                      >
                        {v.text}
                      </Link>
                    ) : (
                      <span key={v.text} className={`${v.num ? "num" : ""} rounded-full border bg-surface/40 px-3 py-1 text-xs ${layer.tone}`}>
                        {v.text}
                      </span>
                    )
                  )}
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
