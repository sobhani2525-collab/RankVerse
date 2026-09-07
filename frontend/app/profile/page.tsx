"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getMyRatings, getMyLists, UserRating } from "@/lib/api";
import Loading from "@/components/Loading";

// TMDb poster base — اگه جای دیگه‌ای توی پروژه یه هلپر برای این داری
// (مثلاً lib/tmdb.ts)، به‌جای این ثابت از همون استفاده کن.
const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w185";

export default function ProfilePage() {
  const { user, token, loading: authLoading } = useAuth();
  const router = useRouter();

  const [ratings, setRatings] = useState<UserRating[] | null>(null);
  const [loadingRatings, setLoadingRatings] = useState(true);
  const [ratingsError, setRatingsError] = useState<string | null>(null);

  const [lists, setLists] = useState<any[] | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listsError, setListsError] = useState<string | null>(null);

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

  // دریافت لیست‌های ساخته‌شده توسط کاربر
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    getMyLists(token)
      .then((data) => {
        if (!cancelled) setLists(data);
      })
      .catch(() => {
        if (!cancelled) setListsError("دریافت لیست‌ها با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const { totalCount, avgScore } = useMemo(() => {
    if (!ratings || ratings.length === 0) {
      return { totalCount: 0, avgScore: null as number | null };
    }
    const sum = ratings.reduce((acc, r) => acc + r.score, 0);
    return { totalCount: ratings.length, avgScore: sum / ratings.length };
  }, [ratings]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loading />
      </div>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-bg pb-24 text-ink">
      {/* --- Hero --- */}
      <section className="border-b border-border">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-6 pb-10 pt-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-surface text-2xl font-bold text-gold">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <h1 className="mt-4 text-xl font-bold">{user.username}</h1>
          <p className="mt-1 text-sm text-muted" dir="ltr">
            {user.email}
          </p>
        </div>
      </section>

      {/* --- Stats --- */}
      <section className="mx-auto mt-8 max-w-2xl px-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-surface px-5 py-4">
            <div className="text-2xl font-bold text-gold">
              {loadingRatings ? "—" : totalCount}
            </div>
            <div className="mt-1 text-xs text-muted">رتبه‌بندی‌های ثبت‌شده</div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-5 py-4">
            <div className="text-2xl font-bold text-teal">
              {loadingRatings ? "—" : avgScore != null ? avgScore.toFixed(1) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted">میانگین امتیاز شما</div>
          </div>
        </div>
      </section>

      {/* --- Lists --- */}
      <section className="mx-auto mt-10 max-w-2xl px-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm text-muted">لیست‌های شما</h2>
          <Link href="/lists/new" className="text-xs text-gold hover:underline">
            لیست جدید
          </Link>
        </div>

        {loadingLists && <Loading />}

        {!loadingLists && listsError && (
          <div className="rounded-lg border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            {listsError}
          </div>
        )}

        {!loadingLists && !listsError && lists && lists.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-5 py-8 text-center">
            <p className="text-sm text-muted">هنوز هیچ لیستی نساخته‌اید.</p>
            <Link href="/lists/new" className="mt-4 inline-block text-sm text-gold hover:underline">
              ساخت اولین لیست
            </Link>
          </div>
        )}

        {!loadingLists && !listsError && lists && lists.length > 0 && (
          <ul className="flex flex-col gap-3">
            {lists.map((list) => (
              <li key={list.id ?? list.slug}>
                <Link
                  href={`/lists/${list.slug}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-gold/30"
                >
                  <span className="truncate text-sm">{list.title}</span>
                  {typeof list.item_count === "number" && (
                    <span className="flex-shrink-0 text-xs text-muted">
                      {list.item_count} مورد
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Ratings list --- */}
      <section className="mx-auto mt-10 max-w-2xl px-6">
        <h2 className="mb-4 text-sm text-muted">رتبه‌بندی‌های شما</h2>

        {loadingRatings && <Loading />}

        {!loadingRatings && ratingsError && (
          <div className="rounded-lg border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            {ratingsError}
          </div>
        )}

        {!loadingRatings && !ratingsError && ratings && ratings.length === 0 && (
          <div className="rounded-lg border border-border bg-surface px-5 py-10 text-center">
            <p className="text-sm text-muted">هنوز هیچ فیلمی رتبه‌بندی نکرده‌اید.</p>
            <Link href="/" className="mt-4 inline-block text-sm text-gold hover:underline">
              رفتن به فهرست فیلم‌ها
            </Link>
          </div>
        )}

        {!loadingRatings && !ratingsError && ratings && ratings.length > 0 && (
          <ul className="flex flex-col gap-3">
            {ratings.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/movies/${r.movie_slug}`}
                  className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-gold/30"
                >
                  <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-bg">
                    {r.movie_poster_path && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${TMDB_POSTER_BASE}${r.movie_poster_path}`}
                        alt={r.movie_title}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{r.movie_title}</p>
                  </div>

                  <div className="flex-shrink-0 rounded-full border border-teal/30 px-3 py-1 text-sm text-teal">
                    {r.score.toFixed(1)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
