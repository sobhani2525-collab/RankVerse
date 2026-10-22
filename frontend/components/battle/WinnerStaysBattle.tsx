"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { detailPathFor } from "@/lib/entity-routes";
import { useAuth } from "@/lib/auth-context";
import { castBattleVote, getMovieBySlug, getTvSeriesBySlug } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { SITE_NAME } from "@/lib/site";
import ShareMenu from "@/components/share/ShareMenu";
import { PickMark, useBattlePick } from "@/components/battle/PickMark";
import { renderStoryCard } from "@/lib/story-card";
import { downloadBlob } from "@/lib/share";

/** Which card a pick went to: "left" is the champion (it stays), "right" the challenger. */
export type Side = "left" | "right";

/** One entry of a battle. Posters are TMDb paths ("/abc.jpg"). */
export interface WinnerStaysItem {
  id: string;
  slug: string;
  title: string;
  title_fa: string | null;
  entity_type: string;
  poster_path: string | null;
  year: number | null;
}

export interface WinnerStaysShare {
  /** Where "اشتراک نتیجه" points; a function gets the run's champion and length. */
  url: string | ((run: { championSlug: string; streak: number; count: number }) => string);
  /** Subject of the share text ("قهرمان من در «X»"); null for the generic line. */
  topic: string | null;
  /** Battle name on the story card ("انتخاب نهایی من در نبرد «X»"). */
  battleName?: string | null;
  /** Story-card line when there is no battle name. */
  fallbackLine?: string;
}

export interface WinnerStaysBattleProps {
  /** In play order; the first entry opens as the champion and the rest challenge it one by one. */
  items: WinnerStaysItem[];
  /** Entity type of the entries; used by the default pick-saving (quick battles). */
  category: string;
  signedIn: boolean;
  /** The line above the cards. */
  reason: string;
  share: WinnerStaysShare;
  /** Saves one pick of a signed-in viewer. Default: POST /battles/vote (the quick battle's Elo vote). */
  savePick?: (championId: string, challengerId: string, winner: Side) => Promise<unknown>;
  /** Called on every pick, signed in or not, before it is saved. */
  onPick?: (championId: string, challengerId: string, winner: Side) => void;
  /** Called once when the run is over, with the id of its champion. */
  onDone?: (championId: string) => void;
  /** "نبرد بعدی". */
  onNext: () => void;
  /** Shows "رد کردن این نبرد" when given. */
  onSkipBattle?: () => void;
  /** "winner" (default): the champion with its name and the buttons; "actions": only the buttons. */
  doneView?: "winner" | "actions";
  /** Extra buttons next to "نبرد بعدی" when the run is over. */
  extraDoneActions?: ReactNode;
}

/**
 * The "winner stays" battle, as one self-contained piece used everywhere (home, quick battles,
 * user battles, featured battles): two cards, the picked one stays and meets the next entry,
 * until the entries run out. It owns the whole run -- the cards, VS badge, progress, skipping a
 * pair, the pick animation, saving picks and the finished view with share / story / next --
 * and knows nothing about where the entries come from.
 */
export default function WinnerStaysBattle({
  items,
  category,
  signedIn,
  reason,
  share,
  savePick,
  onPick,
  onDone,
  onNext,
  onSkipBattle,
  doneView = "winner",
  extraDoneActions,
}: WinnerStaysBattleProps) {
  const { getToken } = useAuth();
  // The champion's index and the next challenger's (items[0] opens as champion).
  const [champion, setChampion] = useState(0);
  const [step, setStep] = useState(1);
  const [streak, setStreak] = useState(0);
  const [voted, setVoted] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const done = step >= items.length;
  const championItem = items[champion];
  const championId = championItem.id;
  useEffect(() => {
    if (done) onDone?.(championId);
  }, [done, onDone, championId]);

  // The story card is drawn only when asked for, once per finished run.
  const storyBlob = useRef<Promise<Blob | null> | null>(null);
  const storyName = share.battleName;
  const storyFallback = share.fallbackLine;
  const buildStory = useCallback(() => {
    if (!storyBlob.current) {
      const series = championItem.entity_type === "tv_series";
      const kind = series ? "سریال" : "فیلم";
      const p = storyCredit(championItem)
        .then((credit) =>
          renderStoryCard({
            posterPath: championItem.poster_path,
            title: championItem.title_fa || championItem.title,
            subtitle: championItem.title_fa ? championItem.title : null,
            heading: series ? "نبرد سریال‌های برگزیده" : "نبرد فیلم‌های برگزیده",
            themeLine: storyName ? `انتخاب نهایی من در نبرد «${storyName}»` : storyFallback ?? "انتخاب نهایی من",
            year: championItem.year,
            credit,
            posterBadge: "برنده",
            stepsTitle: `نبرد ${kind}‌ها چطور بازی می‌شود؟`,
            steps: [`دو ${kind} می‌بینی`, "یکی را انتخاب می‌کنی", "ادامه بده تا برنده معلوم بشه"],
          })
        )
        .catch(() => null);
      storyBlob.current = p;
      void p.then((b) => {
        if (!b && storyBlob.current === p) storyBlob.current = null;
      });
    }
    return storyBlob.current;
  }, [championItem, storyName, storyFallback]);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);
  async function downloadStory() {
    if (storyBusy) return;
    setStoryError(null);
    setStoryBusy(true);
    try {
      const blob = await buildStory();
      if (blob) downloadBlob(blob, "cinemagozin-champion.png");
      else setStoryError("ساخت کارت استوری ممکن نشد");
    } finally {
      setStoryBusy(false);
    }
  }

  const championName = championItem.title_fa || championItem.title;
  const shareUrl =
    typeof share.url === "function" ? share.url({ championSlug: championItem.slug, streak, count: items.length }) : share.url;
  const shareText = `${share.topic ? `قهرمان من در «${share.topic}»` : "قهرمان نبرد من"}: ${championName} 🏆 تو چه کسی را انتخاب می‌کنی؟`;
  const challengerItem = items[Math.min(step, items.length - 1)];

  const pickAnim = useBattlePick<Side>();

  function pick(winner: Side) {
    if (done || pickAnim.busy) return;
    onPick?.(championItem.id, challengerItem.id, winner);
    const token = getToken();
    const save =
      savePick ??
      ((c: string, ch: string, w: Side) => castBattleVote(token ?? "", { category, left_item: c, right_item: ch, winner: w }));
    const request = token
      ? save(championItem.id, challengerItem.id, winner).catch((e) =>
          setError(e instanceof Error ? e.message : "ثبت رأی ممکن نشد")
        )
      : null;
    pickAnim.start(winner, request, () => {
      if (winner === "left") {
        setStreak((n) => n + 1);
      } else {
        setChampion(step);
        setStreak(1);
      }
      setVoted((n) => n + 1);
      setStep((s) => s + 1);
    });
  }

  const reasonLine = (
    <p key={`reason-${step}`} className="mb-6 flex items-center justify-center gap-2 text-center text-[13px] text-violet-light" aria-live="polite">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-light" aria-hidden="true" />
      {reason}
    </p>
  );

  const progress = (
    <div className="relative mx-auto mt-8 h-[3px] w-full max-w-xl overflow-hidden rounded-full bg-surface2" aria-hidden="true">
      <div
        className="absolute inset-y-0 start-0 rounded-full bg-gold transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${(Math.min(step - 1, items.length - 1) / (items.length - 1)) * 100}%` }}
      />
    </div>
  );

  if (done) {
    const href = detailPathFor(championItem.entity_type, championItem.slug);
    return (
      <div className="mx-auto max-w-xl">
        <div className="rv-rise mt-6 flex flex-col items-center gap-5 text-center">
          {doneView === "winner" && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-52 sm:w-60">
                <span className="absolute -top-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-gold px-4 py-1 text-xs font-extrabold text-bg shadow-[0_8px_24px_-6px_rgba(232,179,74,0.7)]">
                  <TrophyIcon className="h-3.5 w-3.5" />
                  برنده
                </span>
                {(() => {
                  const poster = (
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl border-2 border-gold bg-surface2 shadow-[0_0_0_6px_rgba(232,179,74,0.16),0_28px_70px_-18px_rgba(232,179,74,0.5)]">
                      <BattlePoster item={championItem} sizes="(max-width: 640px) 208px, 240px" />
                    </div>
                  );
                  return href ? (
                    <Link href={href} aria-label={`صفحهٔ ${championName}`} className="block transition hover:brightness-110">
                      {poster}
                    </Link>
                  ) : (
                    poster
                  );
                })()}
              </div>
              <div className="flex flex-col items-center gap-0.5">
                {href ? (
                  <Link href={href} className="text-2xl font-black leading-tight text-ink transition hover:text-gold sm:text-3xl">
                    {championName}
                  </Link>
                ) : (
                  <span className="text-2xl font-black leading-tight text-ink sm:text-3xl">{championName}</span>
                )}
                {championItem.title_fa && (
                  <span className="text-base text-ink-dim sm:text-lg" dir="ltr">
                    {championItem.title}
                  </span>
                )}
                {championItem.year ? <span className="num text-base font-bold text-ink-dim">{toFaDigits(championItem.year)}</span> : null}
              </div>
            </div>
          )}

          {voted > 0 && getToken() && !error && <p className="text-sm text-teal">رأی‌هایت در رتبه‌بندی ثبت شد.</p>}
          {error && <p className="text-xs text-gold">{error}</p>}

          <div className="flex w-full max-w-sm flex-col gap-3">
            <button
              type="button"
              onClick={onNext}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-gold to-[#f2c76a] px-8 text-base font-extrabold text-bg shadow-[0_10px_30px_-8px_rgba(232,179,74,0.65),0_0_0_4px_rgba(232,179,74,0.16)] transition hover:-translate-y-0.5 hover:brightness-105"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
              </svg>
              نبرد بعدی
            </button>
            <div className="grid grid-cols-2 gap-3">
              {/* the share button is stretched to the same size as its neighbour */}
              <div className="[&>div]:block [&>div]:w-full [&_button]:h-11 [&_button]:w-full [&_button]:justify-center [&_button]:py-0 [&_button]:text-sm [&_button]:font-bold">
                <ShareMenu
                  variant="button"
                  label="اشتراک نتیجه"
                  url={shareUrl}
                  title={`${championName} | ${SITE_NAME}`}
                  text={shareText}
                  getImage={buildStory}
                />
              </div>
              <button
                type="button"
                onClick={downloadStory}
                disabled={storyBusy}
                aria-busy={storyBusy}
                className={`${DONE_ACTION} disabled:pointer-events-none disabled:opacity-70`}
              >
                {storyBusy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />
                  </svg>
                )}
                {storyBusy ? "در حال ساخت…" : "کارت استوری"}
              </button>
            </div>
            {extraDoneActions}
          </div>
          {storyError && <p className="text-xs text-gold">{storyError}</p>}
        </div>
      </div>
    );
  }

  const sides: [Side, WinnerStaysItem][] = [
    ["left", championItem],
    ["right", challengerItem],
  ];

  return (
    <div className="mx-auto max-w-xl">
      {reasonLine}

      {/* RTL grid: the champion (the vote's left_item) sits on the right. */}
      <div className="relative grid grid-cols-2 gap-4 sm:gap-10">
        {sides.map(([side, item]) => {
          const isChampion = side === "left";
          const gold = pickAnim.picked === side || (isChampion && streak > 0);
          return (
            <button
              key={isChampion ? `champion-${champion}` : `challenger-${step}`}
              type="button"
              onClick={() => pick(side)}
              disabled={pickAnim.busy}
              aria-label={`انتخاب ${item.title_fa || item.title}`}
              className="group relative text-right transition"
            >
              <span
                className={`relative block aspect-[2/3] w-full overflow-hidden rounded-2xl border-[1.5px] bg-surface2 ${
                  gold
                    ? "border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.18)]"
                    : "border-violet-light shadow-[0_0_0_4px_rgba(169,155,255,0.14)] group-hover:shadow-[0_0_0_4px_rgba(169,155,255,0.28)]"
                }`}
              >
                <BattlePoster item={item} sizes="(max-width: 768px) 45vw, 320px" zoom />
                {pickAnim.picked === side && <PickMark phase={pickAnim.phase} />}
              </span>
              {isChampion && streak > 0 && (
                <span className="absolute start-3 top-3 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold text-gold">
                  <span className="num">{toFaDigits(streak)}</span> برد
                </span>
              )}
              {/* a fixed height, so both titles line up however long they are */}
              <span className="block h-[5.5rem] overflow-hidden px-1 pt-3">
                <span className="block line-clamp-1 text-base font-bold text-ink">{item.title_fa || item.title}</span>
                {item.title_fa && (
                  <span className="block line-clamp-1 text-sm text-ink-dim" dir="ltr">
                    {item.title}
                  </span>
                )}
                {item.year ? <span className="num block text-sm text-muted">{toFaDigits(item.year)}</span> : null}
              </span>
            </button>
          );
        })}
        <VsBadge style={{ top: "calc((100% - 5.5rem) / 2)" }} />
      </div>

      {progress}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        <span className="text-xs text-dim">
          جفت <span className="num">{toFaDigits(step)}</span> از <span className="num">{toFaDigits(items.length - 1)}</span>
        </span>
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="rounded-full border border-border px-5 py-2 text-sm text-muted transition hover:bg-surface2"
        >
          رد کردن این جفت
        </button>
        {onSkipBattle && (
          <button
            type="button"
            onClick={onSkipBattle}
            className="rounded-full border border-violet-light/40 px-5 py-2 text-sm text-violet-light transition hover:bg-violet-light/10"
          >
            رد کردن این نبرد
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-center text-xs text-gold">{error}</p>}
    </div>
  );
}

/** Look shared by the secondary buttons of the finished view (also used by callers' extra actions). */
export const DONE_ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface/70 px-4 text-sm font-bold text-ink-dim transition hover:-translate-y-0.5 hover:border-gold/50 hover:bg-gold/[0.06] hover:text-gold";

function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 14v3.5M8.5 20h7M9.5 17.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** The director (a series' creator) for the story card; none if the lookup fails. */
async function storyCredit(item: WinnerStaysItem): Promise<{ label: string; name: string } | null> {
  try {
    if (item.entity_type === "tv_series") {
      const d = await getTvSeriesBySlug(item.slug);
      const p = d.creators[0] ?? d.directors[0];
      return p ? { label: d.creators[0] ? "سازنده" : "کارگردان", name: p.title_fa || p.title } : null;
    }
    const p = (await getMovieBySlug(item.slug)).directors[0];
    return p ? { label: "کارگردان", name: p.title_fa || p.title } : null;
  } catch {
    return null;
  }
}

export function BattlePoster({ item, sizes, zoom }: { item: Pick<WinnerStaysItem, "poster_path">; sizes: string; zoom?: boolean }) {
  return item.poster_path ? (
    <Image
      src={`https://image.tmdb.org/t/p/w500${item.poster_path}`}
      alt=""
      fill
      sizes={sizes}
      className={`object-cover ${zoom ? "transition duration-500 group-hover:scale-105" : ""}`}
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center text-xs text-muted">بدون پوستر</span>
  );
}

export function VsBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-[#05070D] font-mono text-xs font-bold tracking-widest text-violet-light shadow-[0_0_0_6px_rgba(5,7,13,0.9),0_0_36px_rgba(145,99,245,0.55)] sm:h-16 sm:w-16 sm:text-base"
    >
      VS
    </span>
  );
}
