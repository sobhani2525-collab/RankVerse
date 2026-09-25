"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ListBacklink, ListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { genreLabel } from "@/lib/genre-labels";
import {
  entityHref, GENRE_CHIP, PEOPLE_CHIP, posterUrl, typeLabel,
} from "@/lib/list-constellation";
import { Chip, MonoLabel, RowLabel } from "./ui";
import ItemVoteButtons from "./ItemVoteButtons";
import { BattleJumpButton, RemoveItemButton } from "./ItemRowActions";

function formatScore(score: number): string {
  return toFaDigits(score.toFixed(1));
}

function PosterFallback({ title }: { title: string }) {
  return (
    <div
      dir="ltr"
      className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-surface-2 to-bg p-3.5 text-left lg:p-2.5"
    >
      <MonoLabel size="text-[9px] lg:text-[9px]" className="text-dim/70">
        POSTER
      </MonoLabel>
      <span className="font-mono text-sm leading-snug text-muted lg:text-[11px]">{title}</span>
    </div>
  );
}

/** One list item on the constellation spine. */
export default function ListNodeItem({
  item,
  backlink,
  battleIndex,
  pending = false,
  className = "",
}: {
  item: ListItem;
  backlink?: ListBacklink;
  /** This item's index when it has someone to battle on this page, else null. */
  battleIndex: number | null;
  /** Added optimistically and not saved yet. */
  pending?: boolean;
  className?: string;
}) {
  const { entity } = item;
  const href = entityHref(entity.entity_type, entity.slug);
  const title = displayTitle(entity);
  const type = typeLabel(entity.entity_type);
  const poster = posterUrl(entity.poster_path, "w500");
  const people = [item.director, item.lead_actor].filter(
    (p, i, all): p is NonNullable<typeof p> => !!p && all.findIndex((q) => q?.id === p.id) === i
  );
  const genres = item.genres ?? [];
  const score = item.composite_score;
  const [removing, setRemoving] = useState(false);
  const overview = item.overview?.trim();

  const posterBox = (
    <div className="relative aspect-[2/3] w-full overflow-hidden border-b border-border-soft bg-surface-2 lg:w-[104px] lg:shrink-0 lg:self-start lg:rounded-[10px] lg:border lg:border-border">
      {poster ? (
        <Image src={poster} alt={title} fill sizes="(max-width: 1024px) 90vw, 104px" className="object-cover" />
      ) : (
        <PosterFallback title={entity.title} />
      )}
    </div>
  );

  return (
    <article
      aria-busy={removing}
      className={`overflow-hidden rounded-2xl border border-border-soft bg-surface transition-opacity duration-200 lg:flex lg:gap-6 lg:rounded-[18px] lg:p-[22px] ${removing ? "pointer-events-none opacity-40" : ""} ${className}`}
    >
      {href ? (
        <Link href={href} aria-label={title} className="block lg:shrink-0">
          {posterBox}
        </Link>
      ) : (
        posterBox
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-4 lg:gap-3 lg:p-0">
        <div className="flex flex-col items-start gap-1.5 text-start lg:gap-2.5">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-2 lg:gap-2.5">
              <MonoLabel size="text-[10px] lg:text-[11px]" className="text-gold">
                {type.en}
              </MonoLabel>
              <span className="text-xs text-muted lg:text-[13px]">{type.fa}</span>
            </div>
            {score != null && (
              <div className="flex items-baseline gap-1.5 lg:hidden">
                <span className="text-[11px] text-muted">امتیاز ترکیبی</span>
                <span className="num text-xl font-extrabold text-ink">{formatScore(score)}</span>
              </div>
            )}
          </div>
          {href ? (
            <Link href={href} className="text-lg font-extrabold leading-[1.5] text-ink transition hover:text-gold lg:text-[22px] lg:leading-[1.4]">
              {title}
            </Link>
          ) : (
            <span className="text-lg font-extrabold leading-[1.5] text-ink lg:text-[22px] lg:leading-[1.4]">{title}</span>
          )}
          {overview && (
            <p className="line-clamp-2 text-[13px] leading-[1.8] text-[#9AA3B8] lg:text-sm lg:leading-[1.8]">{overview}</p>
          )}
        </div>

        {(people.length > 0 || genres.length > 0 || item.year) && (
          <div className="flex flex-col gap-3.5 lg:flex-row lg:flex-wrap lg:gap-7 lg:pt-0.5">
            {people.length > 0 && (
              <div className="flex flex-col items-start gap-2">
                <RowLabel dot="bg-violet-light" en="PEOPLE" fa="آدم‌ها" />
                <div className="flex flex-wrap gap-1.5">
                  {people.map((p) => (
                    <Chip key={p.id} href={entityHref("person", p.slug)} tone={PEOPLE_CHIP} ltr>
                      {p.title}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-5 lg:contents">
              {genres.length > 0 && (
                <div className="flex flex-1 flex-col items-start gap-2 lg:flex-none">
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
              {item.year ? (
                <div className="flex shrink-0 flex-col items-start gap-2">
                  <RowLabel dot="bg-ink-dim" en="YEAR" fa="سال" />
                  <Chip tone="border-border bg-surface-2 font-bold tracking-[0.08em] text-ink">
                    <span className="num">{toFaDigits(item.year)}</span>
                  </Chip>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {item.note && (
          <div className="flex flex-col items-start gap-1 border-t border-border-soft pt-3 text-start lg:border-0 lg:pt-1">
            <MonoLabel size="text-[10px]" className="shrink-0 text-dim">
              WHY HERE
            </MonoLabel>
            <p className="whitespace-pre-line text-[13px] leading-[1.8] text-ink-dim lg:text-sm lg:leading-[1.8]">{item.note}</p>
          </div>
        )}

        {backlink && (
          <a
            href={`#rank-${backlink.target_position}`}
            className="flex min-h-[32px] items-center gap-1.5 text-xs text-violet-light hover:underline lg:gap-2 lg:text-[13px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
            <span>
              به #{toFaDigits(backlink.target_position)} هم وصل است ·{" "}
              <span dir="ltr">{backlink.person_name}</span>
            </span>
          </a>
        )}

        <ItemVoteButtons
          itemId={item.id}
          pending={pending}
          initial={{ like_count: item.like_count, dislike_count: item.dislike_count, my_vote: item.my_vote }}
          trailing={
            <>
              {battleIndex !== null && !pending && <BattleJumpButton index={battleIndex} />}
              {item.can_remove && !pending && (
                <RemoveItemButton itemId={item.id} title={title} onRemoving={setRemoving} />
              )}
            </>
          }
        />
      </div>

      {score != null && (
        <div className="hidden w-[118px] shrink-0 flex-col items-start gap-1 border-r border-border-soft pr-5 text-start lg:flex">
          <MonoLabel size="text-[10px]" className="text-dim">
            SCORE
          </MonoLabel>
          <span className="num text-4xl font-extrabold leading-tight text-ink">{formatScore(score)}</span>
          <span className="text-xs text-muted">امتیاز ترکیبی</span>
        </div>
      )}
    </article>
  );
}
