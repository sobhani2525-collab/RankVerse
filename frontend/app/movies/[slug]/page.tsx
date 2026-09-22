import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import ScoreBadge from "@/components/ScoreBadge";
import StarRating from "@/components/rating/StarRating";
import RelatedEntities from "@/components/RelatedEntities";
import DirectorWorks from "@/components/DirectorWorks";
import BattleAndRankings from "@/components/BattleAndRankings";
import EntityLists from "@/components/EntityLists";
import { getMovieBySlug, getRelatedEntities, getMovieRankings, getPersonBySlug, RelatedEntity, RankingHighlight } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { MovieListItem, SuggestedBattle } from "@/lib/types";

export const revalidate = 60;

export default async function MovieDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let movie;
  try {
    movie = await getMovieBySlug(slug);
  } catch {
    notFound();
  }

  let related: RelatedEntity[] = [];
  try {
    related = await getRelatedEntities(movie.id);
  } catch {
    related = [];
  }

  let rankingHighlights: RankingHighlight[] = [];
  try {
    rankingHighlights = await getMovieRankings(movie.slug);
  } catch {
    rankingHighlights = [];
  }

  // Powers both the "ساخته‌های دیگر X" section and, when there's no
  // personalized suggested-battle pick (every guest, or a logged-in user
  // without a taste anchor), the fallback battle below -- this movie vs.
  // the director's own next-best-scored other film, so the card has
  // something to show instead of nothing.
  const mainDirector = movie.directors[0] ?? null;
  let directorWorks: MovieListItem[] = [];
  if (mainDirector) {
    try {
      const director = await getPersonBySlug(mainDirector.slug);
      directorWorks = [...director.directed, ...director.created].filter((m) => m.id !== movie.id);
    } catch {
      directorWorks = [];
    }
  }
  const fallbackBattle: SuggestedBattle | null =
    mainDirector && directorWorks.length > 0
      ? {
          category: "movie",
          left: {
            id: directorWorks[0].id,
            slug: directorWorks[0].slug,
            title: directorWorks[0].title,
            title_fa: directorWorks[0].title_fa,
            entity_type: directorWorks[0].entity_type,
            poster_path: directorWorks[0].poster_path,
            computed_score: directorWorks[0].computed_score,
          },
          right: {
            id: movie.id,
            slug: movie.slug,
            title: movie.title,
            title_fa: movie.title_fa,
            entity_type: movie.entity_type,
            poster_path: movie.poster_path,
            computed_score: movie.computed_score,
          },
        }
      : null;

  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {/* Deliberately bigger than any related-entity card (max ~227px wide
            at the lg:grid-cols-5 breakpoint of a max-w-7xl page) so the
            movie's own poster always reads as the primary image on the page. */}
        <div className="h-96 w-64 shrink-0 overflow-hidden rounded-xl bg-surface2 sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={displayTitle(movie)}
              width={256}
              height={384}
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
              <h1 className="font-display text-2xl text-ink">{displayTitle(movie)}</h1>
              <p className="mt-1 text-sm text-muted">
                <span className="num">{toFaDigits(movie.year ?? "-")}</span>
                {movie.runtime != null && (
                  <>
                    {" - "}
                    <span className="num">{toFaDigits(movie.runtime)}</span> دقیقه
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DetailFavoriteButton entity={movie} size={44} />
              <DetailShareButton entity={movie} title={displayTitle(movie)} size={44} />
            </div>
          </div>

          <div className="mt-4">
            <StarRating entity={movie} />
          </div>

          <div className="mt-3 flex justify-end">
            <AddToListMenu entity={movie} />
          </div>

          <div className="mt-4">
            <ScoreBadge score={movie.computed_score} />
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
                  {movie.genres.map((g) => genreLabel(g.title)).join("، ")}
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
        <RelatedEntities items={related} />
      </div>

      {mainDirector && (
        <div className="mt-10">
          <DirectorWorks directorName={mainDirector.title} items={directorWorks} />
        </div>
      )}

      <div className="mt-10">
        <BattleAndRankings
          entityType="movie"
          slug={movie.slug}
          rankingHighlights={rankingHighlights}
          fallbackBattle={fallbackBattle}
        />
      </div>

      <EntityLists entityId={movie.id} />
    </main>
  );
}