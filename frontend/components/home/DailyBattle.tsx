"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SectionHeading from "./SectionHeading";
import { Poster, VsBadge } from "./BattleArena";
import ShareMenu from "@/components/share/ShareMenu";
import { PickMark } from "@/components/battle/PickMark";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { castDailyVote, getDailyBattle } from "@/lib/api";
import { DailyBattleToday, DailyFilm, DailySide } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { renderStoryCard } from "@/lib/story-card";
import { downloadBlob } from "@/lib/share";
import { formatCountdown, formatJalaliDate, getGuestId, percents, sharePercent } from "@/lib/daily-battle";
import CardTitle from "@/components/entities/card-title";
import Link from "next/link";
import BattleSpotlight from "./BattleSpotlight";
import { genreLabel } from "@/lib/genre-labels";

/** Why these two were paired, as a short headline over the posters. */
function pairingOf(theme: DailyBattleToday["theme"]): string {
  if (theme.kind === "genre") return `نبرد دو فیلم ${genreLabel(theme.value)}`;
  if (theme.kind === "decade") return `نبرد دو فیلم از دههٔ ${toFaDigits(theme.value)} میلادی`;
  if (theme.kind === "director") return `نبرد دو فیلم از ${theme.value}`;
  return "دو فیلم محبوب، رو در رو";
}

/** Below this many votes the percentages say little, so they carry a caveat. */
const LOW_VOTES = 5;

type Status = "loading" | "ready" | "error" | "none";

/**
 * "نبرد امروز": one fixed pair per Tehran day for everybody. Fetched on the
 * client with no-store (the home page is ISR, this must never be stale). Results
 * only appear after the visitor has voted -- the server enforces that too.
 */
export default function DailyBattle({ large = false, embedded = false }: { large?: boolean; embedded?: boolean }) {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const { openLoginModal } = useAuthGate();
  const signedIn = !authLoading && isAuthenticated;

  const [data, setData] = useState<DailyBattleToday | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [votingSide, setVotingSide] = useState<DailySide | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const deadline = useRef(0);

  const apply = useCallback((next: DailyBattleToday) => {
    setData(next);
    deadline.current = Date.now() + next.seconds_until_next * 1000;
    setSecondsLeft(next.seconds_until_next);
  }, []);

  const load = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    setError(null);
    try {
      const next = await getDailyBattle(signedIn ? getToken() : null, getGuestId());
      if (!next) {
        setData(null);
        setStatus("none");
        return;
      }
      apply(next);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت نبرد امروز ممکن نشد");
      setStatus("error");
    }
  }, [apply, getToken, signedIn]);

  // Reload when the sign-in state settles or changes (a logged-in vote is the user's own).
  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  // Countdown to Tehran midnight; a new day means a new pair.
  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(() => {
      const left = Math.round((deadline.current - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0) {
        deadline.current = Date.now() + 60_000; // don't refetch every tick while the server catches up
        void load();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status, load]);

  async function vote(choice: DailySide) {
    if (!data || data.my_choice || voting) return;
    setVoting(true);
    setVotingSide(choice);
    setError(null);
    try {
      apply(await castDailyVote(signedIn ? getToken() : null, getGuestId(), { daily_battle_id: data.daily_battle_id, choice }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت رأی ممکن نشد");
      // The day may have rolled over under us; pick up the new pair.
      void load();
    } finally {
      setVoting(false);
      setVotingSide(null);
    }
  }

  if (status === "none") return null; // no battle today: the section stays quiet

  return (
    <section
      className={
        embedded
          ? "relative rounded-3xl border border-[#2a2f5c] bg-[#141733] max-sm:border-0 max-sm:bg-transparent"
          : "relative border-y border-border/60 bg-[#080B14]/70 max-sm:border-0 max-sm:bg-transparent"
      }
      aria-label="نبرد امروز"
    >
      {!embedded && <BattleSpotlight />}
      <div className={embedded ? "relative p-6 max-sm:p-0" : `relative mx-auto px-6 ${large ? "max-w-4xl py-14" : "max-w-5xl py-20"}`}>
        {embedded ? (
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-extrabold text-ink">
                نبرد امروز{data && <span className="text-sm font-normal text-[#a3a8cc]"> · {toFaDigits(formatJalaliDate(data.battle_date))}</span>}
              </h3>
            </div>
            <span className="shrink-0 rounded-full bg-teal/15 px-3 py-1 text-xs font-bold text-teal">روزانه</span>
          </div>
        ) : (
          <SectionHeading
            center
            kicker="Battle of the day"
            title="نبرد امروز"
            lead={data ? formatJalaliDate(data.battle_date) : undefined}
          />
        )}

        {status === "loading" && (
          <div className={`mx-auto grid grid-cols-2 gap-4 sm:gap-10 max-w-xl`} aria-busy="true">
            <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
            <div className="aspect-[2/3] animate-pulse rounded-2xl bg-surface2" />
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="mx-auto max-w-md rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-400">
            {error}
            <button type="button" onClick={() => void load()} className="mr-2 underline">
              تلاش دوباره
            </button>
          </div>
        )}

        {status === "ready" && data && (
          <DailyBody
            data={data}
            large={large}
            signedIn={signedIn}
            voting={voting}
            votingSide={votingSide}
            secondsLeft={secondsLeft}
            error={error}
            onVote={vote}
            onLogin={openLoginModal}
          />
        )}
      </div>
    </section>
  );
}

function DailyBody({
  data,
  large,
  signedIn,
  voting,
  votingSide,
  secondsLeft,
  error,
  onVote,
  onLogin,
}: {
  data: DailyBattleToday;
  large: boolean;
  signedIn: boolean;
  voting: boolean;
  votingSide: DailySide | null;
  secondsLeft: number;
  error: string | null;
  onVote: (side: DailySide) => void;
  onLogin: () => void;
}) {
  const { my_choice: mine, results } = data;
  const voted = mine !== null && results !== null;
  const sides: [DailySide, DailyFilm][] = [
    ["left", data.left],
    ["right", data.right],
  ];

  return (
    <div className={`mx-auto max-w-xl`}>
      {/* Why this pair: sits straight above the VS badge's column. */}
      <div className="mb-6 flex flex-col items-center gap-1 text-center">
        <span className="text-[11px] tracking-wide text-muted">چرا این دو؟</span>
        <p className="flex items-center gap-2 rounded-full border border-violet-light/30 bg-violet/10 px-4 py-1.5 text-[13px] font-medium text-violet-light">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-light" aria-hidden="true" />
          {pairingOf(data.theme)}
        </p>
      </div>

      {/* RTL grid: left_item sits on the right, like the battle arena. The VS
          badge sits in the posters-only grid so it centers on the posters,
          not on poster + title. */}
      <div className="relative grid grid-cols-2 gap-4 sm:gap-10">
        {sides.map(([side, film]) => {
          const chosen = mine === side;
          return (
            <div key={side}>
              <button
                type="button"
                disabled={voted || voting}
                onClick={() => onVote(side)}
                aria-label={`رأی به ${displayTitle(film)}`}
                aria-pressed={chosen}
                className={`group relative block aspect-[2/3] w-full overflow-hidden rounded-2xl bg-surface2 text-right transition disabled:cursor-default ${
                  chosen
                    ? "border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.22)]"
                    : voted
                      ? "border border-border opacity-70"
                      : "border border-border hover:border-violet-light"
                }`}
              >
                <Poster item={film} sizes={large ? "(max-width: 768px) 45vw, 280px" : "(max-width: 768px) 45vw, 220px"} zoom={!voted} />
                <span className="absolute inset-0 bg-gradient-to-t from-[#05070D]/80 via-transparent to-transparent" />
                {votingSide === side && <PickMark phase="loading" />}
                {chosen && <PickMark phase="done" />}
                {voted && (
                  <span className="num absolute inset-x-0 bottom-0 p-3 text-center text-2xl font-bold text-ink">
                    {toFaDigits(sharePercent(results, side))}٪
                  </span>
                )}
                {chosen && (
                  <span className="absolute start-3 top-3 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold text-gold">انتخاب تو</span>
                )}
              </button>
            </div>
          );
        })}
        <VsBadge />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:gap-10">
        {sides.map(([side, film]) => (
          <div key={side} className="text-center">
            <Link href={`/movies/${film.slug}`} className="block min-w-0 text-sm font-medium text-ink transition hover:text-gold">
              <CardTitle entity={film} className="line-clamp-2" center />
            </Link>
            {film.year != null && <p className="num text-xs text-gold">{toFaDigits(film.year)}</p>}
          </div>
        ))}
      </div>

      {voted ? (
        <Results data={data} signedIn={signedIn} onLogin={onLogin} />
      ) : (
        <p className="mt-6 text-center text-sm text-[#a3a8cc]">روی پوستر فیلم مورد علاقه‌ات بزن؛ رأی تو روی امتیاز نهایی هر دو فیلم اثر می‌گذارد.</p>
      )}

      {error && <p role="alert" className="mt-3 text-center text-xs text-gold">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
        <span>
          نبرد بعدی تا <span className="num text-ink-dim" aria-live="off">{formatCountdown(secondsLeft)}</span>
        </span>
      </div>

      {data.previous && data.previous.total > 0 && <Previous previous={data.previous} />}
    </div>
  );
}

function Results({ data, signedIn, onLogin }: { data: DailyBattleToday; signedIn: boolean; onLogin: () => void }) {
  const results = data.results!;
  const mine = data.my_choice!;
  const p = percents(results);
  const mineFilm = mine === "left" ? data.left : data.right;
  const minePercent = sharePercent(results, mine);

  // Fill from empty on first paint; prefers-reduced-motion skips the transition.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const verdict =
    results.total <= 1
      ? "تو اولین رأی‌دهنده‌ای 🎉"
      : minePercent > 50
        ? "با اکثریت هم‌نظری"
        : minePercent < 50
          ? "از اقلیتی"
          : "دقیقاً نصف‌نصف";

  const storyBlob = useRef<Promise<Blob | null> | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const buildStory = useCallback(() => {
    if (!storyBlob.current) {
      const promise = renderStoryCard({
        posterPath: mineFilm.poster_path,
        title: mineFilm.title_fa || mineFilm.title,
        subtitle: mineFilm.title_fa ? mineFilm.title : null,
        themeLine: `انتخاب من در نبرد امروز · ${formatJalaliDate(data.battle_date)}`,
        heading: "نبرد روز",
        posterBadge: "انتخاب من",
        highlight: results.total > 1 ? `${toFaDigits(minePercent)}٪ با من موافق‌اند` : "اولین رأی‌دهندهٔ امروز",
        footer: "تو چه؟",
      }).catch(() => null);
      storyBlob.current = promise;
      void promise.then((b) => {
        if (!b && storyBlob.current === promise) storyBlob.current = null;
      });
    }
    return storyBlob.current;
  }, [mineFilm, data.battle_date, results.total, minePercent]);

  const [storyBusy, setStoryBusy] = useState(false);
  async function downloadStory() {
    if (storyBusy) return;
    setStoryError(null);
    setStoryBusy(true);
    try {
      const blob = await buildStory();
      if (blob) downloadBlob(blob, "cinemagozin-daily-battle.png");
      else setStoryError("ساخت کارت استوری ممکن نشد");
    } finally {
      setStoryBusy(false);
    }
  }

  const name = mineFilm.title_fa || mineFilm.title;
  const shareText =
    results.total > 1
      ? `امروز در «نبرد روز» به «${name}» رأی دادم؛ ${toFaDigits(minePercent)}٪ با من موافق‌اند. تو چه؟`
      : `امروز در «نبرد روز» به «${name}» رأی دادم؛ اولین رأی‌دهنده بودم. تو چه؟`;

  return (
    <div className="mt-8">
      {/* Same flow direction as the posters: left_item's segment is on the right. */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface2"
        role="img"
        aria-label={`${toFaDigits(p.left)}٪ برای ${displayTitle(data.left)}، ${toFaDigits(p.right)}٪ برای ${displayTitle(data.right)}`}
      >
        <div
          className={`h-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${mine === "left" ? "bg-gold" : "bg-teal/70"}`}
          style={{ width: shown ? `${p.left}%` : "0%" }}
        />
        <div
          className={`h-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${mine === "right" ? "bg-gold" : "bg-teal/70"}`}
          style={{ width: shown ? `${p.right}%` : "0%" }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-ink-dim">
        <span className="num">{toFaDigits(p.left)}٪</span>
        <span className="num">{toFaDigits(p.right)}٪</span>
      </div>

      <p className="mt-3 text-center text-sm text-ink">
        <span className="font-bold text-gold">{verdict}</span>
        <span className="text-muted"> · </span>
        <span className="num text-muted">{toFaDigits(results.total)}</span>
        <span className="text-muted"> رأی</span>
      </p>
      {results.total > 1 && (
        <p className="mt-1 text-center text-sm text-muted">
          <span className="num">{toFaDigits(minePercent)}</span>٪ از رأی‌دهندگان هم‌نظر تو هستند
        </p>
      )}
      {results.total < LOW_VOTES && <p className="mt-1 text-center text-xs text-muted">تعداد رأی کم است؛ درصدها هنوز قطعی نیستند.</p>}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <ShareMenu
          variant="button"
          label="اشتراک نتیجه"
          url={absoluteUrl("/battles/daily")}
          title={`نبرد روز | ${SITE_NAME}`}
          text={shareText}
          getImage={buildStory}
        />
        <button
          type="button"
          onClick={downloadStory}
          disabled={storyBusy}
          aria-busy={storyBusy}
          className="btn-secondary text-sm hover:border-gold/40 hover:text-gold disabled:pointer-events-none disabled:opacity-70"
        >
          {storyBusy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          {storyBusy ? "در حال ساخت کارت…" : "دانلود کارت استوری"}
        </button>
      </div>
      {storyError && <p className="mt-2 text-center text-xs text-gold">{storyError}</p>}

      {!signedIn && (
        <div className="mt-6 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-muted">با ورود، رأی‌هایت در رتبه‌بندی و استریکت ثبت می‌شود.</p>
          <button type="button" onClick={onLogin} className="btn-primary text-sm hover:opacity-90">
            ورود
          </button>
        </div>
      )}
    </div>
  );
}

function Previous({ previous }: { previous: NonNullable<DailyBattleToday["previous"]> }) {
  const winnerFilm = previous.winner === "left" ? previous.left : previous.winner === "right" ? previous.right : null;
  return (
    <div className="mt-8 rounded-xl border border-border bg-surface/60 px-4 py-3 text-center text-xs text-muted">
      <p className="mb-1 font-bold text-ink-dim">نتیجهٔ دیروز</p>
      <p>
        {winnerFilm ? (
          <>
            برنده: <span className="font-bold text-gold">{displayTitle(winnerFilm)}</span>
            {" · "}
            <span className="num">{toFaDigits(sharePercent(previous, previous.winner as DailySide))}٪</span>
          </>
        ) : (
          "مساوی"
        )}
        {" · "}
        <span className="num">{toFaDigits(previous.total)}</span> رأی
      </p>
    </div>
  );
}
