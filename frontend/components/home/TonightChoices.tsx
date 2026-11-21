"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import CardTitle from "@/components/entities/card-title";
import { detailPathFor } from "@/lib/entity-routes";
import { trackDiscovery } from "@/lib/discovery-analytics";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { useHomePicks } from "./HomePicks";

type Choice = { id: string; title: string; title_fa?: string | null; href: string; poster?: string | null; year?: number | null; runtime?: number | null; label?: string; reason?: string };

function buildRounds(groups: Choice[][]): Choice[][] {
  const used = new Set<string>();
  const rounds: Choice[][] = [];
  for (let index = 0; index < Math.max(0, ...groups.map((group) => group.length)); index++) {
    const round = groups.flatMap((group) => {
      const choice = group.find((item) => !used.has(item.id));
      if (!choice) return [];
      used.add(choice.id);
      return [choice];
    });
    if (round.length) rounds.push(round);
  }
  return rounds;
}

export default function TonightChoices({ fallback, groups }: { fallback: Choice[]; groups?: Choice[][] }) {
  const [round, setRound] = useState(0);
  const rounds = groups ? buildRounds(groups) : [];
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
  const choices = personalized.length > 0 ? personalized : (rounds[round] ?? fallback);

  return (
    <>
      {choices.length > 0 && (
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {choices.map((choice) => (
            <li key={choice.id} className="min-w-0">
              <TonightCard choice={choice} personalized={personalized.length > 0} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3">
        {personalized.length > 0 && <p className="text-sm text-teal">بر اساس سلیقهٔ سینمایی تو</p>}
        {personalized.length === 0 && rounds.length > 1 && (
          <button type="button" onClick={() => setRound((round + 1) % rounds.length)} className="inline-flex min-h-11 items-center text-sm font-bold text-teal hover:underline focus-visible:outline-gold">
            {rounds[(round + 1) % rounds.length].length === 3 ? "سه پیشنهاد دیگر" : "پیشنهادهای دیگر"}
          </button>
        )}
        <Link href={personalized.length > 0 ? "#taste-picks" : "/rankings"} className="ms-auto inline-flex min-h-11 items-center text-sm font-bold text-gold hover:underline focus-visible:outline-gold">
          انتخاب‌های بیشتر
        </Link>
      </div>
    </>
  );
}

function TonightCard({ choice, personalized }: { choice: Choice; personalized: boolean }) {
  const { href, poster, year } = choice;
  const title = displayTitle(choice);
  return (
    <Link
      href={href}
      onClick={() => trackDiscovery("Tonight pick opened", { destination: href, placement: personalized ? "personalized" : "by-theme" })}
      aria-label={title}
      title={title}
      className="group flex h-full min-w-0 items-center gap-3 rounded-2xl border border-violet-light/15 bg-gradient-to-l from-[#23203b] to-[#14182c] p-2.5 text-right transition hover:border-violet-light/60 focus-visible:outline-gold"
    >
      <span className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-lg bg-gradient-to-b from-violet-dim to-surface2 lg:w-16">
        {poster && <Image src={poster} alt="" fill sizes="(min-width: 1024px) 64px, 56px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <CardTitle entity={choice} className="truncate text-base font-bold text-ink group-hover:text-violet-light" subClassName="text-sm text-ink-dim" />
        {(year || (choice.runtime ?? 0) > 0) && (
          <span className="mt-1 block text-xs text-muted">
            {[year ? toFaDigits(year) : null, choice.runtime && choice.runtime > 0 ? `${toFaDigits(choice.runtime)} دقیقه` : null].filter(Boolean).join(" · ")}
          </span>
        )}
        {choice.label && <span className="mt-1 block text-xs font-bold text-teal">{choice.label}</span>}
        {choice.reason && <span className="mt-1 block text-xs leading-relaxed text-ink-dim">{choice.reason}</span>}
      </span>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-violet-light/25 text-violet-light group-hover:bg-violet-light group-hover:text-bg">←</span>
    </Link>
  );
}
