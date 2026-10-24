"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWatchLater } from "@/contexts/WatchLaterContext";
import { getMyRatings, getMyLists, getMyTasteDna, getWatchLaterItems, UserRating } from "@/lib/api";
import { TasteProfile, ListSummary, EntityMini } from "@/lib/types";
import { tournamentApi, TournamentSummary } from "@/lib/tournament";
import TournamentCard from "@/components/tournament/TournamentCard";
import Loading from "@/components/Loading";
import TasteDnaSection from "@/components/TasteDnaSection";
import TasteDnaErrorState from "@/components/TasteDnaErrorState";
import EntityMedia from "@/components/entities/entity-media";
import PosterCard from "@/components/entities/poster-card";
import { AuthorAvatar } from "@/components/lists/list-card";
import ListTicketCard from "@/components/lists/list-ticket-card";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import ProfileStats from "@/components/profile/profile-stats";
import ProfileEditor from "@/components/profile/profile-editor";
import AccountSettings from "@/components/profile/account-settings";
import { SectionHeading } from "@/components/list-detail/ui";
import { StarIcon, ListIcon, SwordsIcon, MessageCircleIcon } from "@/components/list-detail/icons";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import CardTitle from "@/components/entities/card-title";

// TMDb poster base — اگه جای دیگه‌ای توی پروژه یه هلپر برای این داری
// (مثلاً lib/tmdb.ts)، به‌جای این ثابت از همون استفاده کن.
const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w185";
// Ratings shown before "show all" -- one row at the widest breakpoint.
const RATINGS_PREVIEW = 6;

function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" />
    </svg>
  );
}

export default function ProfilePage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toggleWatchLater } = useWatchLater();
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [ratings, setRatings] = useState<UserRating[] | null>(null);
  const [loadingRatings, setLoadingRatings] = useState(true);
  const [ratingsError, setRatingsError] = useState<string | null>(null);

  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listsError, setListsError] = useState<string | null>(null);

  const [taste, setTaste] = useState<TasteProfile | null>(null);
  const [loadingTaste, setLoadingTaste] = useState(true);
  const [tasteError, setTasteError] = useState<string | null>(null);
  const [tasteReloadKey, setTasteReloadKey] = useState(0);

  const [playedBattles, setPlayedBattles] = useState<TournamentSummary[]>([]);
  const [playedTotal, setPlayedTotal] = useState(0);
  const [showAllRatings, setShowAllRatings] = useState(false);

  const [watchLater, setWatchLater] = useState<EntityMini[] | null>(null);
  const [loadingWatchLater, setLoadingWatchLater] = useState(true);
  const [watchLaterError, setWatchLaterError] = useState<string | null>(null);

  // گارد احراز هویت
  useEffect(() => {
    if (!authLoading && !token) {
      router.replace("/login");
    }
  }, [authLoading, token, router]);

  // دریافت رتبه‌بندی‌های کاربر
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getMyRatings(token)
      .then((data) => {
        if (!cancelled) setRatings(data);
      })
      .catch(() => {
        if (!cancelled) setRatingsError("دریافت رتبه‌بندی‌ها با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setLoadingRatings(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // دریافت فهرست‌های ساخته‌شده توسط کاربر
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getMyLists(token)
      .then((data) => {
        if (!cancelled) setLists(data);
      })
      .catch(() => {
        if (!cancelled) setListsError("دریافت فهرست‌ها با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // دریافت Taste DNA کاربر — section جدا و مستقل از رتبه‌بندی‌ها/فهرست‌ها،
  // با error state جدا از empty state (پروفایل واقعاً خالیه در مقابل
  // fetch شکست خورده): tasteReloadKey با هر بار retry تغییر می‌کنه تا
  // این effect دوباره اجرا بشه.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingTaste(true);
    setTasteError(null);

    getMyTasteDna(token)
      .then((data) => {
        if (!cancelled) setTaste(data);
      })
      .catch(() => {
        if (!cancelled) setTasteError("دریافت Taste DNA با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTaste(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, tasteReloadKey]);

  // Battles (pool or tournament) the user picked or voted in. Optional
  // extra like the old predicted-picks card: a failure just hides it.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    tournamentApi
      .minePage(token, { tab: "played", page_size: 6 })
      .then(({ items, total }) => {
        if (cancelled) return;
        setPlayedBattles(items);
        setPlayedTotal(total);
      })
      .catch(() => {
        if (!cancelled) setPlayedBattles([]);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // فیلم/سریال‌هایی که با گزینه «بعداً تماشا می‌کنم» ذخیره شده‌اند
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getWatchLaterItems(token)
      .then((data) => {
        if (!cancelled) setWatchLater(data);
      })
      .catch(() => {
        if (!cancelled) setWatchLaterError("دریافت فهرست «بعداً می‌بینم» با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setLoadingWatchLater(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Deep links like /profile#watch-later: the target renders only after its
  // data loads, by which time the browser's own hash scroll has already run.
  const [hashScrolled, setHashScrolled] = useState(false);
  useEffect(() => {
    if (hashScrolled || loadingTaste || loadingLists || loadingRatings || loadingWatchLater) return;
    setHashScrolled(true);
    const id = window.location.hash.slice(1);
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [hashScrolled, loadingTaste, loadingLists, loadingRatings, loadingWatchLater]);

  const totalCount = ratings?.length ?? 0;
  const contribution = taste?.contribution_stats ?? null;

  // Its own section after Taste DNA (it's a to-watch list, not part of the
  // taste reading); #watch-later deep links land here.
  const watchLaterSection = (
    <section id="watch-later" className="mt-16 scroll-mt-24">
      <SectionHeading en="WATCH LATER" fa="تماشا خواهم کرد" />

      <div className="mt-5">
        {loadingWatchLater && <Loading />}

        {!loadingWatchLater && watchLaterError && (
          <p className="text-center text-sm text-muted">{watchLaterError}</p>
        )}

        {!loadingWatchLater && !watchLaterError && watchLater && watchLater.length === 0 && (
          <div className="text-center">
            <p className="text-sm text-muted">هنوز چیزی را برای تماشای بعدی ذخیره نکرده‌اید.</p>
            <Link href="/" className="mt-3 inline-block text-sm text-gold hover:underline">
              رفتن به فهرست فیلم‌ها
            </Link>
          </div>
        )}

        {!loadingWatchLater && !watchLaterError && watchLater && watchLater.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {watchLater.map((entity) => (
              <PosterCard
                key={entity.id}
                entity={entity}
                onRemove={(e) => {
                  toggleWatchLater(e.id);
                  setWatchLater((prev) => prev?.filter((x) => x.id !== e.id) ?? prev);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loading />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-10 lg:px-20 lg:pt-16">
      {/* --- Hero --- */}
      <div className="flex items-center gap-5 border-b border-border-soft pb-10">
        <AuthorAvatar
          author={{ username: user.username, avatarKey: user.avatar_key }}
          sizeClassName="h-20 w-20 md:h-24 md:w-24"
          textClassName="text-3xl md:text-4xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl text-ink md:text-4xl">{user.display_name || user.username}</h1>
          <p className="num mt-1.5 text-right text-sm text-muted" dir="ltr">
            {user.display_name ? `@${user.username} · ` : ""}
            {user.email}
          </p>
          {user.bio && <p className="mt-3 max-w-xl whitespace-pre-line text-[15px] leading-8 text-ink/85">{user.bio}</p>}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            aria-expanded={editing}
            className="mt-4 rounded-lg border border-border px-4 py-1.5 text-sm text-ink transition hover:border-gold/40 hover:text-gold"
          >
            {editing ? "بستن" : "ویرایش پروفایل"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-expanded={settingsOpen}
            className="mr-2 mt-4 rounded-lg border border-border px-4 py-1.5 text-sm text-muted transition hover:border-gold/40 hover:text-gold"
          >
            {settingsOpen ? "بستن تنظیمات" : "تنظیمات حساب"}
          </button>
        </div>
      </div>
      {editing && <ProfileEditor onDone={() => setEditing(false)} />}
      {settingsOpen && <AccountSettings />}

      {/* --- Activity: non-zero counts + contribution level, one card --- */}
      {!loadingRatings && !loadingLists && !loadingTaste && (
        <div className="mt-10">
          <ProfileStats
            contributionScore={contribution?.contribution_score ?? null}
            stats={[
              { key: "ratings", value: totalCount, label: "امتیاز ثبت‌شده", icon: <StarIcon size={18} />, tone: "text-gold", href: "#my-ratings" },
              { key: "lists", value: lists?.length ?? 0, label: "فهرست ساخته‌شده", icon: <ListIcon size={18} />, tone: "text-teal", href: "#my-lists" },
              { key: "votes", value: contribution?.battles_count ?? 0, label: "رأی در نبردها", icon: <SwordsIcon size={18} />, tone: "text-violet-light" },
              { key: "played", value: playedTotal, label: "نبرد شرکت‌کرده", icon: <TrophyIcon />, tone: "text-violet-light", href: "#my-battles" },
              { key: "comments", value: contribution?.comments_count ?? 0, label: "نظر", icon: <MessageCircleIcon size={18} />, tone: "text-ink-dim" },
            ]}
          />
        </div>
      )}

      {/* --- Taste DNA --- */}
      <section className="mt-14">
        <SectionHeading en="TASTE DNA" fa="دی‌ان‌ای سلیقه" />
        <div className="mt-5">
          {loadingTaste && <Loading />}
          {!loadingTaste && tasteError && (
            <TasteDnaErrorState onRetry={() => setTasteReloadKey((k) => k + 1)} />
          )}
          {!loadingTaste && !tasteError && taste && <TasteDnaSection profile={taste} />}
        </div>
      </section>

      {watchLaterSection}

      {/* --- Lists --- */}
      <section id="my-lists" className="mt-16 scroll-mt-24">
        <SectionHeading
          en="YOUR LISTS"
          fa="فهرست‌های شما"
          aside={
            <Link href="/lists/new" className="text-xs font-semibold text-gold hover:underline">
              + فهرست جدید
            </Link>
          }
        />

        <div className="mt-5">
          {loadingLists && <Loading />}

          {!loadingLists && listsError && (
            <div className="rounded-2xl border border-border-soft bg-surface/60 px-5 py-6 text-center text-sm text-muted">
              {listsError}
            </div>
          )}

          {!loadingLists && !listsError && lists && lists.length === 0 && (
            <div className="rounded-2xl border border-border-soft bg-surface/60 px-5 py-8 text-center">
              <p className="text-sm text-muted">هنوز هیچ فهرستی نساخته‌اید.</p>
              <Link href="/lists/new" className="mt-4 inline-block text-sm text-gold hover:underline">
                ساخت اولین فهرست
              </Link>
            </div>
          )}

          {!loadingLists && !listsError && lists && lists.length > 0 && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {lists.map((list) => (
                <ListTicketCard key={list.id} list={listSummaryToTicketCard(list)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* --- Battles played --- */}
      {playedBattles.length > 0 && (
        <section id="my-battles" className="mt-16 scroll-mt-24">
          <SectionHeading
            en="YOUR BATTLES"
            fa="نبردهایی که در آن شرکت کرده‌اید"
            aside={
              <Link href="/battles" className="text-xs font-semibold text-gold hover:underline">
                همهٔ نبردها
              </Link>
            }
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playedBattles.map((b) => (
              <TournamentCard key={b.slug} battle={b} />
            ))}
          </div>
        </section>
      )}

      {/* --- Ratings --- */}
      <section id="my-ratings" className="mt-16 scroll-mt-24">
        <SectionHeading
          en="YOUR RATINGS"
          fa="امتیازهای شما"
          aside={
            ratings && ratings.length > RATINGS_PREVIEW ? (
              <button
                type="button"
                onClick={() => setShowAllRatings((v) => !v)}
                className="text-xs font-semibold text-gold hover:underline"
              >
                {showAllRatings ? "نمایش کمتر" : `نمایش همه (${toFaDigits(ratings.length)})`}
              </button>
            ) : undefined
          }
        />

        <div className="mt-5">
          {loadingRatings && <Loading />}

          {!loadingRatings && ratingsError && (
            <div className="rounded-2xl border border-border-soft bg-surface/60 px-5 py-6 text-center text-sm text-muted">
              {ratingsError}
            </div>
          )}

          {!loadingRatings && !ratingsError && ratings && ratings.length === 0 && (
            <div className="rounded-2xl border border-border-soft bg-surface/60 px-5 py-10 text-center">
              <p className="text-sm text-muted">هنوز هیچ فیلمی رتبه‌بندی نکرده‌اید.</p>
              <Link href="/" className="mt-4 inline-block text-sm text-gold hover:underline">
                رفتن به فهرست فیلم‌ها
              </Link>
            </div>
          )}

          {!loadingRatings && !ratingsError && ratings && ratings.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 lg:gap-5">
              {(showAllRatings ? ratings : ratings.slice(0, RATINGS_PREVIEW)).map((r) => {
                const title = displayTitle({ title: r.movie_title, title_fa: r.movie_title_fa });
                return (
                <Link key={r.id} href={`/movies/${r.movie_slug}`} className="group flex flex-col gap-2">
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border-soft bg-surface2">
                    <EntityMedia
                      src={r.movie_poster_path ? `${TMDB_POSTER_BASE}${r.movie_poster_path}` : null}
                      alt={title}
                      mediaKind="image"
                    />
                    <div
                      className="num pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-gold/40 px-2 py-0.5 text-xs font-bold text-gold backdrop-blur-sm"
                      style={{ background: "rgba(7,11,22,.85)" }}
                      aria-label={`امتیاز شما: ${r.score} از ۵`}
                    >
                      ★ {toFaDigits(r.score)}
                    </div>
                  </div>
                  <span className="min-w-0 text-sm font-bold text-ink transition group-hover:text-teal">
                    <CardTitle entity={{ title: r.movie_title, title_fa: r.movie_title_fa }} className="truncate" />
                  </span>
                </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
