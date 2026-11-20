"use client";

import Link from "next/link";
import Image from "next/image";
import CardTitle from "@/components/entities/card-title";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { useHomePicks } from "./HomePicks";

type Choice = { id: string; title: string; title_fa?: string | null; href: string; poster?: string | null; year?: number | null };

export default function TonightChoices({ fallback }: { fallback: Choice[] }) {
  const personalized = (useHomePicks() ?? []).flatMap(({ entity, year }) => {
    const href = detailPathFor(entity.entity_type, entity.slug);
    return href ? [{
      id: entity.id,
      title: entity.title,
      title_fa: entity.title_fa,
      href,
      poster: entity.poster_path ? `https://image.tmdb.org/t/p/w185${entity.poster_path}` : null,
      year,
    }] : [];
  }).slice(0, 3);
  const choices = personalized.length > 0 ? personalized : fallback;

  return (
    <>
      {choices.length > 0 && (
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {choices.map((choice) => (
            <li key={choice.id} className="min-w-0">
              <TonightCard choice={choice} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
        {personalized.length > 0 && <p className="text-sm text-teal">بر اساس سلیقهٔ سینمایی تو</p>}
        <Link href={personalized.length > 0 ? "#taste-picks" : "/rankings"} className="ms-auto inline-flex min-h-11 items-center text-sm font-bold text-gold hover:underline focus-visible:outline-gold">
          انتخاب‌های بیشتر
        </Link>
      </div>
    </>
  );
}

function TonightCard({ choice }: { choice: Choice }) {
  const { href, poster, year } = choice;
  const title = displayTitle(choice);
  return (
    <Link
      href={href}
      aria-label={title}
      title={title}
      className="group flex h-full min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface/90 p-2.5 text-right transition hover:border-violet-light/50 hover:bg-surface2 focus-visible:outline-gold"
    >
      <span className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-b from-violet-dim to-surface2 lg:w-16">
        {poster && <Image src={poster} alt="" fill sizes="(min-width: 1024px) 64px, 56px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <CardTitle entity={choice} className="truncate text-base font-bold text-ink group-hover:text-violet-light" subClassName="text-sm text-ink-dim" />
        {year && <span className="mt-1 block text-xs text-muted">{toFaDigits(year)}</span>}
      </span>
    </Link>
  );
}
