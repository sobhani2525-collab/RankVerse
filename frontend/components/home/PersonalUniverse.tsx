"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SectionHeading from "./SectionHeading";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useInView } from "@/lib/use-in-view";
import { getMyListStats, getMyPredictedPicks, getMyRatings, getMyTasteDna, MyListStats, UserRating } from "@/lib/api";
import { PredictedPick, TasteProfile } from "@/lib/types";
import { ListIcon, StarIcon, SwordsIcon } from "@/components/list-detail/icons";
import TastePredictedPickRow from "@/components/TastePredictedPickRow";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; ratings: UserRating[]; taste: TasteProfile | null; listStats: MyListStats | null };

/**
 * The signed-in visitor's own corner of the map, built only from what the
 * API returns for them: their ratings (count, average, the titles
 * themselves) and, when computed, their Taste DNA's top genres and
 * contribution stats. Guests and users with no ratings get an onboarding
 * state that points at the real rating flow -- no placeholder numbers.
 */
export default function PersonalUniverse({ startHref }: { startHref: string }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  // Guests get no placeholder card: the section only exists for a signed-in user.
  // The inner component must mount only once signed in, so useInView's ref points
  // at a real element when its effect runs (otherwise the observer never attaches).
  if (authLoading || !isAuthenticated) return null;
  return <PersonalUniverseInner startHref={startHref} />;
}

function PersonalUniverseInner({ startHref }: { startHref: string }) {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [ref, inView] = useInView<HTMLElement>("200px 0px");
  const [state, setState] = useState<State>({ status: "loading" });
  const [picks, setPicks] = useState<PredictedPick[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !inView) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setState({ status: "loading" });
    // Independent of the dashboard: a slow or failed picks call only hides its own row.
    getMyPredictedPicks(token, 6)
      .then((p) => !cancelled && setPicks(p))
      .catch(() => {});
    Promise.all([
      getMyRatings(token),
      getMyTasteDna(token).catch(() => null),
      getMyListStats(token).catch(() => null),
    ])
      .then(([ratings, taste, listStats]) => !cancelled && setState({ status: "ready", ratings, taste, listStats }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, inView, getToken]);

  const signedIn = !authLoading && isAuthenticated;
  const ready = signedIn && state.status === "ready" ? state : null;
  const ratings = ready?.ratings ?? [];

  return (
    <section ref={ref} className="relative border-t border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading kicker="Your cinema" title="سینمای تو." />

        {signedIn && state.status === "loading" && <div className="h-80 animate-pulse rounded-3xl bg-surface2/50" />}

        {signedIn && state.status === "error" && (
          <p role="alert" className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-sm text-muted">
            دریافت اطلاعات حساب ممکن نشد.
          </p>
        )}

        {(!signedIn || (ready && ratings.length === 0)) && (
          <div className="relative flex flex-col items-center overflow-hidden rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
            <EmptyOrbit />
            <p className="relative mt-8 font-display text-2xl text-ink">کهکشان شخصی‌ات منتظر است.</p>
            <p className="relative mt-3 max-w-md text-sm leading-7 text-muted">
              به فیلم‌هایی که دیده‌ای امتیاز بده؛ هر امتیاز یک ستاره به نقشهٔ خودت اضافه می‌کند و سلیقه‌ات کم‌کم شکل می‌گیرد.
            </p>
            {signedIn ? (
              <Link href={startHref} className="btn-primary relative mt-6 text-sm hover:opacity-90">
                شروع امتیازدهی
              </Link>
            ) : (
              <button type="button" onClick={() => requireAuth(() => {})} className="btn-primary relative mt-6 text-sm hover:opacity-90">
                ورود و شروع امتیازدهی
              </button>
            )}
          </div>
        )}

        {ready && ratings.length > 0 && <Dashboard ratings={ratings} taste={ready.taste} listStats={ready.listStats} />}

        {ready && ratings.length > 0 && picks.length > 0 && (
          <div className="mt-12">
            <p className="kicker text-muted/70">For you</p>
            <h3 className="mt-1 text-lg font-bold text-ink">پیشنهاد برای تو، بر اساس سلیقه‌ات</h3>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-muted">
              درصد روی هر پوستر نشان می‌دهد آن عنوان چقدر به سلیقهٔ تو نزدیک است (۱۰۰٪ یعنی کاملاً منطبق). این عدد از ژانرهای
              موردعلاقه‌ات و جایگاه عنوان در رتبه‌بندی کل سایت حساب می‌شود.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
              {picks.map((pick) => (
                <TastePredictedPickRow key={pick.entity.id} pick={pick} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Dashboard({ ratings, taste, listStats }: { ratings: UserRating[]; taste: TasteProfile | null; listStats: MyListStats | null }) {
  const topGenres = (taste?.dimensions ?? [])
    // 50 = average on the genre score; below it isn't a favorite.
    .filter((d) => d.dimension_type === "genre" && d.score > 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const stats = taste?.contribution_stats ?? null;
  const hasLists = !!listStats && listStats.lists_count > 0;

  return (
    <div className="space-y-5">
      <StatGroup title="فعالیت سینمایی تو" tone="gold" cols="sm:grid-cols-3">
        <Stat href="/profile#my-ratings" icon={<StarIcon size={22} />} value={ratings.length} label="فیلم امتیازداده‌شده" />
        {listStats && (
          <Stat href="/profile#watch-later" icon={<IconBookmark />} value={listStats.watch_later_count} label="فیلم در فهرست تماشا" />
        )}
        {stats && <Stat icon={<SwordsIcon size={22} />} value={stats.battles_count} label="نبرد رأی‌داده‌شده" accent="violet" />}
      </StatGroup>

      {hasLists && (
        <StatGroup title="فهرست‌هایی که ساخته‌ای" tone="teal" cols="sm:grid-cols-4">
          <Stat href="/profile#my-lists" icon={<ListIcon size={22} />} value={listStats.lists_count} label="فهرست" />
          <Stat icon={<IconFilm />} value={listStats.items_count} label="عنوان در فهرست‌ها" />
          <Stat icon={<IconHeart />} value={listStats.likes} label="پسند" />
          <Stat icon={<IconUsers />} value={listStats.followers} label="دنبال‌کننده" />
        </StatGroup>
      )}

      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-stretch">
        {topGenres.length > 0 && (
          <div className="rounded-3xl border border-white/5 bg-surface/40 p-6">
            <h3 className="text-sm font-bold text-ink">ژانرهای مورد علاقه</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {topGenres.map((g) => (
                <span key={g.dimension_key} className="rounded-full border border-teal/40 bg-teal/10 px-4 py-1.5 text-sm text-teal">
                  {genreLabel(g.dimension_key)}
                </span>
              ))}
            </div>
          </div>
        )}
        <Link href="/profile" className="btn-secondary justify-center px-8 text-sm hover:border-gold/40 hover:text-gold">
          پروفایل و DNA سلیقه
        </Link>
      </div>
    </div>
  );
}

function StatGroup({ title, tone, cols, children }: { title: string; tone: "gold" | "teal"; cols: string; children: React.ReactNode }) {
  const accent = tone === "gold" ? "from-gold/60" : "from-teal/60";
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-surface/40 p-5 sm:p-6">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-l ${accent} to-transparent`} aria-hidden="true" />
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <div className={`mt-4 grid grid-cols-2 gap-3 ${cols}`}>{children}</div>
    </div>
  );
}

// Each tile: icon chip, big number, label right under it. Tiles that have a
// page behind them are links and lift on hover.
function Stat({
  icon, value, label, href, accent = "gold",
}: { icon: React.ReactNode; value: number; label: string; href?: string; accent?: "gold" | "violet" }) {
  const chip =
    accent === "violet"
      ? "border-violet-strong/50 bg-violet-strong/10 text-violet-light"
      : "border-gold/25 bg-gold/10 text-gold";
  const body = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${chip}`}>{icon}</span>
      <p className="mt-4 text-3xl font-bold leading-none text-ink">{toFaDigits(value)}</p>
      <p className="mt-2 text-xs leading-5 text-muted">{label}</p>
    </>
  );
  const cls = "rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition";
  return href ? (
    <Link href={href} className={`${cls} hover:-translate-y-0.5 hover:border-gold/40 hover:bg-white/[0.06]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const iconProps = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const IconBookmark = () => <svg {...iconProps}><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
const IconFilm = () => <svg {...iconProps}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>;
const IconHeart = () => <svg {...iconProps}><path d="M12 20s-7-4.4-9-9.2C1.8 7.600 3.900 4.500 7 4.500c2 0 3.400 1.100 5 3 1.600-1.900 3-3 5-3 3.100 0 5.200 3.100 4 6.300-2 4.800-9 9.200-9 9.200z" /></svg>;
const IconUsers = () => <svg {...iconProps}><circle cx="9" cy="8" r="3.500" /><path d="M2.500 20c.6-3.400 3.100-5 6.500-5s5.900 1.600 6.500 5M16 4.700a3.500 3.500 0 0 1 0 6.600M18 15.300c2 .6 3.200 2 3.500 4.700" /></svg>;

// Decorative empty orbit for the onboarding state (no data implied).
function EmptyOrbit() {
  return (
    <svg viewBox="0 0 100 100" className="h-40 w-40" aria-hidden="true">
      {[16, 30, 44].map((r) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#F2F0E8" strokeOpacity="0.08" strokeWidth="0.4" strokeDasharray="1 2" />
      ))}
      <circle cx="50" cy="50" r="4" fill="#E8B34A" className="rv-twinkle" />
    </svg>
  );
}
