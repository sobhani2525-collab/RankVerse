"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWatchLater } from "@/contexts/WatchLaterContext";
import { getMyRatings, getMyLists, getMyTasteDna, getMyPredictedPicks, getWatchLaterItems, UserRating } from "@/lib/api";
import { TasteProfile, PredictedPick, ListSummary, EntityMini } from "@/lib/types";
import Loading from "@/components/Loading";
import TasteDnaSection from "@/components/TasteDnaSection";
import TasteDnaErrorState from "@/components/TasteDnaErrorState";
import EntityMedia from "@/components/entities/entity-media";
import PosterCard from "@/components/entities/poster-card";
import ProgressBar from "@/components/ProgressBar";
import { AuthorAvatar } from "@/components/lists/list-card";
import ListTicketCard from "@/components/lists/list-ticket-card";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import StatTile from "@/components/profile/stat-tile";
import ProfileEditor from "@/components/profile/profile-editor";
import { SectionHeading, MonoLabel } from "@/components/list-detail/ui";
import { StarIcon, ListIcon, SwordsIcon, MessageCircleIcon } from "@/components/list-detail/icons";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";

// TMDb poster base — اگه جای دیگه‌ای توی پروژه یه هلپر برای این داری
// (مثلاً lib/tmdb.ts)، به‌جای این ثابت از همون استفاده کن.
const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w185";

export default function ProfilePage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toggleWatchLater } = useWatchLater();
  const [editing, setEditing] = useState(false);

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

  const [predictedPicks, setPredictedPicks] = useState<PredictedPick[]>([]);

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

  // پیش‌بینی انتخاب بعدی — endpoint جدا از taste-dna اصلی (query سنگین‌تره،
  // یه محاسبه‌ی زنده‌ست نه خوندن داده‌ی از‌قبل‌محاسبه‌شده)، پس لود اولیه‌ی
  // پروفایل رو کند نمی‌کنه. شکست خوردنش هم چیز مهمی نیست -- کارت پیشنهادی
  // یه افزونه‌ست نه بخش اصلی پروفایل، پس فقط مثل حالت خالی نشونش نمی‌دیم.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getMyPredictedPicks(token)
      .then((data) => {
        if (!cancelled) setPredictedPicks(data);
      })
      .catch(() => {
        if (!cancelled) setPredictedPicks([]);
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

  const totalCount = ratings?.length ?? 0;
  const contribution = taste?.contribution_stats ?? null;
  const contributionScorePercent =
    contribution != null ? Math.max(0, Math.min(100, contribution.contribution_score)) : null;

  // Styled like its new neighbors inside the Taste DNA section (NEXT PICK,
  // TASTE ANCHORS): a bordered card with a mono kicker, sitting right
  // after predicted picks -- see TasteDnaSection's afterPredictedPicks slot.
  const watchLaterSection = (
    <div className="rounded-2xl border border-border-soft bg-surface/60 p-6">
      <MonoLabel size="text-[10px]">WATCH LATER</MonoLabel>
      <h3 className="mt-1 text-base font-bold text-ink">تماشا خواهم کرد</h3>

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
    </div>
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
        </div>
      </div>
      {editing && <ProfileEditor onDone={() => setEditing(false)} />}

      {/* --- Stats: ratings + activity/contribution merged into one strip -- */}
      <div className="mt-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatTile
            mono="RATINGS"
            value={loadingRatings ? "—" : toFaDigits(totalCount)}
            label="رتبه‌بندی‌های ثبت‌شده"
            icon={<StarIcon size={20} />}
            accent="#E8B34A"
            valueClassName="text-gold"
          />
          <StatTile
            mono="LISTS"
            value={loadingLists ? "—" : toFaDigits(lists?.length ?? 0)}
            label="فهرست‌های ساخته‌شده"
            icon={<ListIcon size={20} />}
            accent="#4FB8A6"
            valueClassName="text-teal"
          />
          <StatTile
            mono="BATTLES"
            value={loadingTaste ? "—" : toFaDigits(contribution?.battles_count ?? 0)}
            label="نبرد"
            icon={<SwordsIcon size={20} />}
            accent="#A99BFF"
            valueClassName="text-violet-light"
          />
          <StatTile
            mono="COMMENTS"
            value={loadingTaste ? "—" : toFaDigits(contribution?.comments_count ?? 0)}
            label="نظر"
            icon={<MessageCircleIcon size={20} />}
            accent="#8A93A6"
          />
        </div>

        {!loadingTaste && contributionScorePercent != null && (
          <div className="mt-4 rounded-2xl border border-border-soft bg-surface/60 px-6 py-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
              <span>امتیاز مشارکت</span>
              <span className="num text-ink">{toFaDigits(Math.round(contribution!.contribution_score))}</span>
            </div>
            <ProgressBar value={contributionScorePercent} fillClassName="bg-teal" />
          </div>
        )}
      </div>

      {/* --- Taste DNA --- */}
      <section className="mt-14">
        <SectionHeading en="TASTE DNA" fa="دی‌ان‌ای سلیقه" />
        <div className="mt-5">
          {loadingTaste && <Loading />}
          {!loadingTaste && tasteError && (
            <div className="flex flex-col gap-5">
              <TasteDnaErrorState onRetry={() => setTasteReloadKey((k) => k + 1)} />
              {watchLaterSection}
            </div>
          )}
          {!loadingTaste && !tasteError && taste && (
            <TasteDnaSection profile={taste} predictedPicks={predictedPicks} afterPredictedPicks={watchLaterSection} />
          )}
        </div>
      </section>

      {/* --- Lists --- */}
      <section className="mt-16">
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

      {/* --- Ratings --- */}
      <section className="mt-16">
        <SectionHeading en="YOUR RATINGS" fa="رتبه‌بندی‌های شما" />

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
              {ratings.map((r) => {
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
                      className="pointer-events-none absolute right-2 top-2 h-9 w-9 rounded-full p-[1.5px]"
                      style={{ background: "linear-gradient(135deg, #9163f5, #4FB8A6)" }}
                    >
                      <div
                        className="num flex h-full w-full items-center justify-center rounded-full text-xs font-bold text-ink backdrop-blur-sm"
                        style={{ background: "rgba(7,11,22,.85)" }}
                      >
                        {toFaDigits(r.score.toFixed(1))}
                      </div>
                    </div>
                  </div>
                  <span className="truncate text-sm font-bold text-ink transition group-hover:text-teal">
                    {title}
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
