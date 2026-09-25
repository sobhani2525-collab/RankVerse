"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { castBattleVote } from "@/lib/api";
import type { ListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { entityHref, posterUrl } from "@/lib/list-constellation";
import ProgressBar from "@/components/ProgressBar";
import { SectionHeading } from "./ui";

type Side = "left" | "right";

/** Mirrors BATTLE_TYPES in app/modules/lists/graph.py. */
const BATTLE_TYPES = new Set(["movie", "tv_series"]);

/**
 * Step-by-step "winner stays" battle through the whole list: #1 vs #2,
 * the pick then faces #3, that pick faces #4, ... and whoever survives
 * the last round is the list's winner. The progress bar tracks rounds
 * played out of items - 1.
 *
 * Each round is also cast as a normal /battles vote -- but only for
 * same-type movie/tv_series pairs, since the backend rejects cross-type
 * matchups. Other rounds still count toward this local run.
 */
export default function ListBattlePreview({ items }: { items: ListItem[] }) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  // Index (into items) of the current champion, and of the next challenger.
  const [champion, setChampion] = useState(0);
  const [challenger, setChallenger] = useState(1);
  const [beaten, setBeaten] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totalRounds = items.length - 1;
  const round = challenger - 1; // rounds already played
  const done = challenger >= items.length;
  const progress = totalRounds > 0 ? (round / totalRounds) * 100 : 0;

  function recordVote(left: ListItem, right: ListItem, winner: Side) {
    const token = getToken();
    const type = left.entity.entity_type;
    if (!token || type !== right.entity.entity_type || !BATTLE_TYPES.has(type)) return;
    castBattleVote(token, {
      category: type,
      left_item: left.entity.id,
      right_item: right.entity.id,
      winner,
    }).catch((err) => setError(err instanceof Error ? err.message : "خطا در ثبت رأی"));
  }

  function pick(winner: Side) {
    if (done) return;
    setError(null);
    recordVote(items[champion], items[challenger], winner);
    if (winner === "left") {
      setBeaten((n) => n + 1);
    } else {
      setChampion(challenger);
      setBeaten(1);
    }
    setChallenger((c) => c + 1);
  }

  function restart() {
    setChampion(0);
    setChallenger(1);
    setBeaten(0);
    setError(null);
  }

  const heading = (
    <SectionHeading
      en="BATTLE"
      fa={done ? "برنده‌ی این لیست" : "کدام بهتر است؟"}
      tone="text-violet-light"
      aside={
        <span className="pb-1 text-xs text-dim">
          مرحله <span className="num">{toFaDigits(Math.min(round + 1, totalRounds))}</span> از{" "}
          <span className="num">{toFaDigits(totalRounds)}</span>
        </span>
      }
    />
  );

  const progressBar = (
    <div className="flex flex-col gap-1.5">
      <ProgressBar
        value={progress}
        trackClassName="bg-surface-2"
        fillClassName="bg-gradient-brand transition-[width] duration-500 ease-out"
      />
      <div className="flex justify-between text-[11px] text-dim">
        <span>
          <span className="num">{toFaDigits(round)}</span> نبرد انجام شد
        </span>
        <span className="num" dir="ltr">
          {toFaDigits(Math.round(progress))}٪
        </span>
      </div>
    </div>
  );

  if (done) {
    const winner = items[champion];
    const href = entityHref(winner.entity.entity_type, winner.entity.slug);
    const poster = posterUrl(winner.entity.poster_path, "w500");
    return (
      <section aria-labelledby="list-battle-heading" className="flex flex-col gap-4">
        <div id="list-battle-heading">{heading}</div>
        {progressBar}

        <div className="flex items-center gap-4" aria-live="polite">
          <div className="relative aspect-[2/3] w-28 shrink-0 animate-pop-in overflow-hidden rounded-xl border border-gold bg-surface-2 shadow-[0_0_0_3px_rgba(232,179,74,0.35)]">
            {poster ? (
              <Image src={poster} alt="" fill sizes="112px" className="object-cover" />
            ) : (
              <span dir="ltr" className="absolute inset-0 flex items-end bg-gradient-to-br from-surface-2 to-bg p-2 text-left font-mono text-[11px] text-muted">
                {winner.entity.title}
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-bold text-gold">🏆 قهرمان</span>
            {href ? (
              <Link href={href} className="text-lg font-extrabold leading-snug text-ink hover:text-gold">
                {winner.entity.title_fa || winner.entity.title}
              </Link>
            ) : (
              <span className="text-lg font-extrabold leading-snug text-ink">
                {winner.entity.title_fa || winner.entity.title}
              </span>
            )}
            <span className="text-xs text-dim">
              #{toFaDigits(champion + 1)} در لیست · <span className="num">{toFaDigits(beaten)}</span> پیروزی پیاپی
            </span>
          </div>
        </div>

        {error && <p className="text-xs text-gold">{error}</p>}

        <button
          type="button"
          onClick={restart}
          className="flex min-h-[44px] items-center self-start text-sm font-bold text-violet-light hover:text-ink"
        >
          ↻ دوباره از اول
        </button>
      </section>
    );
  }

  const sides: [Side, number][] = [
    ["left", champion],
    ["right", challenger],
  ];

  return (
    <section aria-labelledby="list-battle-heading" className="flex flex-col gap-4">
      <div id="list-battle-heading">{heading}</div>
      {progressBar}

      <div className="relative grid grid-cols-2 gap-2.5">
        {sides.map(([side, index]) => {
          const item = items[index];
          const title = displayTitle(item.entity);
          const poster = posterUrl(item.entity.poster_path, "w500");
          return (
            <button
              // Keyed by item so a new challenger (or a new champion) pops in.
              key={`${side}-${item.id}`}
              type="button"
              onClick={() => requireAuth(() => pick(side))}
              aria-label={`انتخاب ${title}`}
              className="relative aspect-[2/3] w-full animate-pop-in overflow-hidden rounded-xl border border-border bg-surface-2 transition hover:border-violet-light"
            >
              {poster ? (
                <Image src={poster} alt="" fill sizes="(max-width: 1024px) 45vw, 185px" className="object-cover" />
              ) : (
                <span dir="ltr" className="absolute inset-0 flex items-end bg-gradient-to-br from-surface-2 to-bg p-2.5 text-left font-mono text-xs text-muted">
                  {item.entity.title}
                </span>
              )}
              {side === "left" && beaten > 0 && (
                <span className="absolute start-2 top-2 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold text-gold">
                  <span className="num">{toFaDigits(beaten)}</span> برد
                </span>
              )}
            </button>
          );
        })}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-bg font-mono text-xs text-violet-light shadow-[0_0_0_6px_rgba(11,15,26,0.9)]"
          aria-hidden="true"
        >
          VS
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {sides.map(([side, index]) => {
          const item = items[index];
          const href = entityHref(item.entity.entity_type, item.entity.slug);
          return (
            <div key={side} className="flex flex-col gap-0.5">
              {href ? (
                <Link href={href} className="text-[15px] font-extrabold leading-snug text-ink hover:text-gold">
                  {item.entity.title_fa || item.entity.title}
                </Link>
              ) : (
                <span className="text-[15px] font-extrabold text-ink">{item.entity.title_fa || item.entity.title}</span>
              )}
              <span className="text-xs text-dim">
                #{toFaDigits(index + 1)} در لیست
                {item.year ? <> · <span className="num">{toFaDigits(item.year)}</span></> : null}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[13px] leading-[1.8] text-muted" aria-live="polite">
        روی پوستر محبوب‌ترت بزن — برنده می‌ماند و با گزینه‌ی بعدی لیست روبه‌رو می‌شود
        {challenger + 1 < items.length && (
          <>
            {" "}
            (بعدی: <span className="text-ink-dim">{items[challenger + 1].entity.title_fa || items[challenger + 1].entity.title}</span>)
          </>
        )}
        .
      </p>
      {error && <p className="text-xs text-gold">{error}</p>}
    </section>
  );
}
