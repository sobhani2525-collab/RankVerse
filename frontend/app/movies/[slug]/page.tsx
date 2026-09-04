import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Constellation from "@/components/Constellation";
import ScoreBadge from "@/components/ScoreBadge";
import RatingWidget from "@/components/RatingWidget";
import { getMovieBySlug } from "@/lib/api";

export const revalidate = 60;

export default async function MovieDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let movie;
  try {
    movie = await getMovieBySlug(slug);
  } catch {
    notFound();
  }

  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null;
  const mainDirector = movie.directors[0]?.title ?? null;
  const mainGenre = movie.genres[0]?.title ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        ← بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        <div className="h-72 w-48 shrink-0 overflow-hidden rounded-xl bg-surface2 sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={movie.title}
              width={192}
              height={288}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted">
              بدون پوستر
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ink">{movie.title}</h1>
              <p className="num mt-1 text-sm text-muted">
                {movie.year ?? "—"} {movie.runtime ? `· ${movie.runtime} دقیقه` : ""}
              </p>
            </div>
            <Constellation director={mainDirector} genre={mainGenre} year={movie.year} size={80} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <ScoreBadge score={movie.computed_score} />
            <span className="num text-xs text-muted">{movie.total_votes} رای کاربران</span>
          </div>

          {movie.overview && (
            <p className="mt-5 text-sm leading-relaxed text-ink/90">{movie.overview}</p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {movie.directors.length > 0 && (
              <div>
                <dt className="text-xs text-muted">کارگردان</dt>
                <dd className="mt-1 text-ink">
                  {movie.directors.map((d) => d.title).join("، ")}
                </dd>
              </div>
            )}
            {movie.genres.length > 0 && (
              <div>
                <dt className="text-xs text-muted">ژانر</dt>
                <dd className="mt-1 text-ink">
                  {movie.genres.map((g) => g.title).join("، ")}
                </dd>
              </div>
            )}
            {movie.cast.length > 0 && (
              <div className="col-span-2">
                <dt className="text-xs text-muted">بازیگران</dt>
                <dd className="mt-1 text-ink">{movie.cast.map((c) => c.title).join("، ")}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="mt-10">
        <RatingWidget slug={movie.slug} />
      </div>
    </main>
  );
}
