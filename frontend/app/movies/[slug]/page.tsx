import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import BattleJumpButton from "@/components/entities/battle-jump-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import EntityScoreRow from "@/components/EntityScoreRow";
import { MonoLabel, Chip } from "@/components/list-detail/ui";
import { GENRE_CHIP, entityHref } from "@/lib/list-constellation";
import RelatedEntities from "@/components/RelatedEntities";
import DirectorWorks from "@/components/DirectorWorks";
import BattleSection from "@/components/BattleSection";
import EntityGraphWithSidebar from "@/components/EntityGraphWithSidebar";
import { getMovieBySlug, getRelatedEntities, getMovieRankings, getPersonBySlug, RelatedEntity, RankingHighlight, isNotFoundError } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { MovieListItem, SuggestedBattle } from "@/lib/types";

export const revalidate = 3600;

// No paths are prerendered at build; each one is rendered on its first
// visit and then served from the ISR cache. Without this export the route
// is fully dynamic and `revalidate` above only affects the fetch cache.
export async function generateStaticParams() {
  return [];
}

export default async function MovieDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Each backend read costs ~1.5s (DB round trips), so reads are issued as
  // soon as their input is known instead of one after another: rankings
  // only need the URL slug, related/director only need the movie.
  const rankingsPromise = getMovieRankings(slug).catch((): RankingHighlight[] => []);
  let movie;
  try {
    movie = await getMovieBySlug(slug);
  } catch (err) {
    // Only a real 404 is a 404: a timeout or 5xx rethrows, so ISR keeps
    // the last good page instead of caching "not found" for an hour.
    if (isNotFoundError(err)) notFound();
    throw err;
  }

  // Powers both the "ساخته‌های دیگر X" section and, when there's no
  // personalized suggested-battle pick (every guest, or a logged-in user
  // without a taste anchor), the fallback battle below -- this movie vs.
  // the director's own next-best-scored other film, so the card has
  // something to show instead of nothing.
  const mainDirector = movie.directors[0] ?? null;
  const movieId = movie.id;
  const [related, rankingHighlights, directorWorks] = await Promise.all([
    getRelatedEntities(movieId).catch((): RelatedEntity[] => []),
    rankingsPromise,
    mainDirector
      ? getPersonBySlug(mainDirector.slug)
          .then((director) => {
            // A person can appear in both `directed` and `created` (e.g. a
            // director who also created a show) -- dedupe by id so
            // DirectorWorks' key={item.id} never collides.
            const combined = [...director.directed, ...director.created];
            const unique = [...new Map(combined.map((m) => [m.id, m])).values()];
            return unique.filter((m) => m.id !== movieId);
          })
          .catch((): MovieListItem[] => [])
      : Promise.resolve<MovieListItem[]>([]),
  ]);
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

  const peopleRows = movie.directors.length > 0 ? [{ label: "کارگردان", people: movie.directors }] : [];

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {/* Deliberately bigger than any related-entity card (max ~227px wide
            at the lg:grid-cols-5 breakpoint of a max-w-7xl page) so the
            movie's own poster always reads as the primary image on the page. */}
        <div className="h-[480px] w-80 shrink-0 overflow-hidden rounded-xl bg-surface2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={displayTitle(movie)}
              width={320}
              height={480}
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
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] border-gold">
                  <span className="h-2 w-2 rounded-full bg-gold" />
                </span>
                <div className="flex flex-col gap-0.5 leading-none">
                  <MonoLabel size="text-[10px]" className="text-gold">
                    MOVIE
                  </MonoLabel>
                  <span className="text-xs text-muted">فیلم</span>
                </div>
              </div>

              <h1 className="text-[30px] font-black leading-[1.35] text-ink lg:text-[56px] lg:leading-[1.2]">
                {movie.title_fa ?? movie.title}.
              </h1>
              {movie.title_fa && (
                <p dir="ltr" className="block text-right text-2xl font-black leading-[1.2] text-dim lg:text-[44px]">
                  {movie.title}.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DetailFavoriteButton entity={movie} size={48} shape="square" />
              <DetailShareButton entity={movie} title={displayTitle(movie)} size={48} shape="square" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip tone="border-border bg-surface-2 font-bold tracking-[0.08em] text-ink">
              <span className="num">{toFaDigits(movie.year ?? "-")}</span>
            </Chip>
            {movie.runtime != null && (
              <Chip tone="border-border bg-surface-2 text-ink">
                <span className="num">{toFaDigits(movie.runtime)}</span> دقیقه
              </Chip>
            )}
            {movie.genres.map((g) => (
              <Chip key={g.id} href={entityHref("genre", g.slug)} tone={GENRE_CHIP}>
                {genreLabel(g.title)}
              </Chip>
            ))}
          </div>

          <EntityScoreRow
            score={movie.computed_score}
            imdbId={movie.imdb_id}
            imdbRating={movie.imdb_rating}
            imdbVotes={movie.imdb_votes}
            ratingEntity={movie}
            entityId={movie.id}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AddToListMenu entity={movie} />
            <BattleJumpButton />
          </div>

          {movie.overview && (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <MonoLabel size="text-[10px]" className="text-dim">
                  OVERVIEW
                </MonoLabel>
                <span className="text-xs text-muted">خلاصه</span>
              </div>
              <p className="mt-2 text-[17px] leading-[2] text-ink/90 lg:text-[17px]">{movie.overview}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-16">
        <EntityGraphWithSidebar
          entityType="movie"
          peopleRows={peopleRows}
          cast={movie.cast}
          genres={movie.genres}
          year={movie.year}
          rankingHighlights={rankingHighlights}
          entityId={movie.id}
        />
      </div>

      <div className="mt-10 border-t border-border-soft pt-10">
        <BattleSection
          entityType="movie"
          slug={movie.slug}
          fallbackBattle={fallbackBattle}
          directorName={mainDirector ? (mainDirector.title_fa ?? mainDirector.title) : null}
        />
      </div>

      {mainDirector && (
        <div className="mt-10">
          <DirectorWorks directorName={mainDirector.title_fa ?? mainDirector.title} directorSlug={mainDirector.slug} items={directorWorks} />
        </div>
      )}

      <div className="mt-10">
        <RelatedEntities items={related} excludeIds={directorWorks.map((w) => w.id)} />
      </div>

      <footer className="mt-14 flex flex-col gap-2 border-t border-border-soft pb-4 pt-6 text-xs leading-[1.8] text-dim lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:text-[13px]">
        <span>امتیاز ترکیبی از رأی جامعه (میانگین بیزی)، روند محبوبیت و نتایج نبردها محاسبه می‌شود.</span>
        <Link href="/rankings" className="flex min-h-[44px] shrink-0 items-center text-violet-light hover:text-ink">
          روش امتیازدهی
        </Link>
      </footer>
    </main>
  );
}
