"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getMyRatings, UserRating } from "@/lib/api";

export default function MyRatingsPage() {
  const router = useRouter();
  const { token, isAuthenticated, loading: authLoading } = useAuth();
  const [ratings, setRatings] = useState<UserRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (token) {
      getMyRatings(token)
        .then(setRatings)
        .catch((err) => setError(err instanceof Error ? err.message : "خطا در دریافت رای‌ها"))
        .finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated, token, router]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14 text-center text-muted">
        در حال بارگذاری...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-2xl font-bold text-ink">رای‌های من</h1>
      <p className="mt-1 text-sm text-muted">فیلم‌هایی که به آن‌ها امتیاز داده‌اید</p>

      {error && (
        <p className="mt-6 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold">
          {error}
        </p>
      )}

      {!error && ratings.length === 0 && (
        <p className="mt-8 text-center text-sm text-muted">
          هنوز به هیچ فیلمی رای نداده‌اید.{" "}
          <Link href="/" className="text-teal hover:underline">
            برو به فهرست فیلم‌ها
          </Link>
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {ratings.map((r) => {
          const posterUrl = r.movie_poster_path
            ? `https://image.tmdb.org/t/p/w200${r.movie_poster_path}`
            : null;
          return (
            <Link
              key={r.id}
              href={`/movies/${r.movie_slug}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-gold/40"
            >
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
                {posterUrl && (
                  <Image
                    src={posterUrl}
                    alt={r.movie_title}
                    width={44}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <span className="flex-1 text-sm text-ink">{r.movie_title}</span>
              <span className="num rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-sm font-bold text-gold">
                {r.score}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
