"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { castBattleVote } from "@/lib/api";
import type { ListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { BATTLE_SECTION_ID, battleLink, battleOpponents, entityHref, posterUrl, type EdgeKind } from "@/lib/list-constellation";
import { SectionHeading } from "./ui";
import { nextAnchor, useListBattle } from "./ListBattleContext";
import { useListViewer } from "./ListViewerContext";

type Side = "left" | "right";

const REASON_TONE: Record<EdgeKind, { text: string; dot: string }> = {
  people: { text: "text-violet-light", dot: "bg-violet-light" },
  genre: { text: "text-teal", dot: "bg-teal" },
  none: { text: "text-muted", dot: "bg-dim/60" },
};

const shortTitle = (item: ListItem) => item.entity.title_fa || item.entity.title;

/**
 * The list page's BATTLE section, "winner stays": a run starts from one
 * item (the anchor) and goes through every other same-type item of the
 * list, closest to the anchor in the graph first (see battleOpponents).
 * Whichever poster is picked stays on the right as the champion and faces
 * the next item. Each tap is cast as a normal /battles vote; the run
 * itself is page state (ListBattleContext), and any item's "نبرد" button
 * restarts it from that item.
 */
export default function ListBattlePreview() {
  const { items } = useListViewer().detail;
  const { anchor, runId, start } = useListBattle();
  if (items.length < 2 || anchor >= items.length) return null;
  return (
    <section id={BATTLE_SECTION_ID} aria-labelledby="list-battle-heading" className="flex scroll-mt-24 flex-col gap-4">
      {/* Keyed by run and by the items, so a new anchor (or the same one
          again) or an added/removed item starts over from pair 1. */}
      <BattleRun key={`${runId}:${items.map((i) => i.id).join(",")}`} items={items} anchor={anchor} onNext={() => start(nextAnchor(items, anchor))} />
    </section>
  );
}

function BattleRun({ items, anchor, onNext }: { items: ListItem[]; anchor: number; onNext: () => void }) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const opponents = useMemo(() => battleOpponents(items, anchor), [items, anchor]);
  const [step, setStep] = useState(0);
  // Index (into items) of the current champion, and its winning streak.
  const [champion, setChampion] = useState(anchor);
  const [streak, setStreak] = useState(0);
  const [voted, setVoted] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const anchorItem = items[anchor];
  const total = opponents.length;
  const done = step >= total;
  const challenger = opponents[Math.min(step, total - 1)];
  const championItem = items[champion];

  function pick(winner: Side) {
    if (done) return;
    const token = getToken();
    if (token) {
      castBattleVote(token, {
        category: championItem.entity.entity_type,
        left_item: championItem.entity.id,
        right_item: items[challenger].entity.id,
        winner,
      }).catch((err) => setError(err instanceof Error ? err.message : "خطا در ثبت رأی"));
    }
    if (winner === "left") {
      setStreak((n) => n + 1);
    } else {
      setChampion(challenger);
      setStreak(1);
    }
    setVoted((n) => n + 1);
    setStep((s) => s + 1);
  }

  const heading = (
    <div id="list-battle-heading" className="flex flex-col gap-1.5">
      <SectionHeading en="BATTLE" fa={done ? "نبرد تمام شد" : "کدام بهتر است؟"} tone="text-violet-light" />
      {total > 0 && (
        <p className="text-xs text-dim">
          نبرد از #{toFaDigits(anchor + 1)} · <span className="text-ink-dim">{shortTitle(anchorItem)}</span>
          {!done && (
            <>
              {" "}— جفت <span className="num">{toFaDigits(step + 1)}</span> از <span className="num">{toFaDigits(total)}</span>
            </>
          )}
        </p>
      )}
    </div>
  );

  const progressBar = (
    <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <div
        className="absolute inset-y-0 start-0 rounded-full bg-violet-light transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${total > 0 ? (Math.min(step, total) / total) * 100 : 0}%` }}
      />
    </div>
  );

  const nextButton = (
    <button
      type="button"
      onClick={onNext}
      className="flex min-h-[44px] items-center self-start rounded-[10px] border border-violet-strong/60 px-4 text-sm font-bold text-violet-light transition hover:border-violet-light"
    >
      نبرد با آیتم دیگر
    </button>
  );

  if (total === 0) {
    return (
      <>
        {heading}
        <p className="text-[13px] leading-[1.8] text-muted">
          «{shortTitle(anchorItem)}» در این لیست هم‌نوعی برای نبرد ندارد.
        </p>
        {nextAnchor(items, anchor) !== anchor && nextButton}
      </>
    );
  }

  if (done) {
    return (
      <>
        {heading}
        {progressBar}
        <div className="flex flex-col gap-1 text-[13px] leading-[1.8] battle-swap" aria-live="polite">
          <p className="font-bold text-ink">نبرد «{shortTitle(anchorItem)}» با همه آیتم‌های لیست تمام شد.</p>
          {streak > 0 && (
            <p className="text-ink-dim">
              🏆 برنده: <span className="font-bold text-gold">{shortTitle(championItem)}</span> ·{" "}
              <span className="num">{toFaDigits(streak)}</span> برد پیاپی
            </p>
          )}
          {voted > 0 && !error && <p className="text-muted">رأی‌هایت در رتبه‌بندی عمومی ثبت شد.</p>}
        </div>
        {error && <p className="text-xs text-gold">{error}</p>}
        {nextButton}
      </>
    );
  }

  const link = battleLink(championItem, items[challenger]);
  const tone = REASON_TONE[link.kind];
  const sides: [Side, ListItem, number][] = [
    ["left", championItem, champion],
    ["right", items[challenger], challenger],
  ];

  return (
    <>
      {heading}

      <p key={`reason-${step}`} className={`flex items-center gap-2 text-[13px] battle-swap ${tone.text}`} aria-live="polite">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        {link.reason}
      </p>

      {/* RTL grid: the champion (the vote's left_item) sits on the right. The
          challenger re-mounts each pair (keyed by step) to replay the swap-in;
          the champion only when a new one takes over. */}
      <div className="relative grid grid-cols-2 gap-2.5">
        {sides.map(([side, item]) => {
          const isChampion = side === "left";
          const poster = posterUrl(item.entity.poster_path, "w500");
          return (
            <button
              key={isChampion ? `champion-${champion}` : `challenger-${step}`}
              type="button"
              onClick={() => requireAuth(() => pick(side))}
              aria-label={`انتخاب ${displayTitle(item.entity)}`}
              className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 transition ${
                isChampion
                  ? `border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.18)] hover:shadow-[0_0_0_4px_rgba(232,179,74,0.32)] ${champion !== anchor ? "battle-swap" : ""}`
                  : "battle-swap border border-border hover:border-violet-light"
              }`}
            >
              {poster ? (
                <Image src={poster} alt="" fill sizes="(max-width: 1024px) 45vw, 185px" className="object-cover" />
              ) : (
                <span dir="ltr" className="absolute inset-0 flex items-end bg-gradient-to-br from-surface-2 to-bg p-2.5 text-left font-mono text-xs text-muted">
                  {item.entity.title}
                </span>
              )}
              {isChampion && streak > 0 && (
                <span className="absolute start-2 top-2 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold text-gold">
                  <span className="num">{toFaDigits(streak)}</span> برد
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
        {sides.map(([side, item, index]) => {
          const href = entityHref(item.entity.entity_type, item.entity.slug);
          return (
            <div
              key={side === "left" ? `champion-${champion}` : `challenger-${step}`}
              className={`flex flex-col gap-0.5 ${side === "right" || champion !== anchor ? "battle-swap" : ""}`}
            >
              {href ? (
                <Link href={href} className="text-[15px] font-extrabold leading-snug text-ink hover:text-gold">
                  {shortTitle(item)}
                </Link>
              ) : (
                <span className="text-[15px] font-extrabold leading-snug text-ink">{shortTitle(item)}</span>
              )}
              <span className="text-xs text-dim">
                #{toFaDigits(index + 1)} در لیست
                {item.year ? <> · <span className="num">{toFaDigits(item.year)}</span></> : null}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">{progressBar}</div>
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="flex min-h-[44px] shrink-0 items-center text-[13px] text-dim transition hover:text-ink"
        >
          رد کردن
        </button>
      </div>

      {error && <p className="text-xs text-gold">{error}</p>}
    </>
  );
}
