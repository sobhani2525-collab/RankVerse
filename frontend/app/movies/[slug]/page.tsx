import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import BattleJumpButton from "@/components/entities/battle-jump-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import { AmbientGlow, DetailPoster } from "@/components/entities/detail-hero-art";
import TrailerPlayer from "@/components/entities/trailer-player";
import WatchedButton from "@/components/entities/watched-button";
import WatchLinks from "@/components/entities/watch-links";
import EntityScoreRow from "@/components/EntityScoreRow";
import { MonoLabel, Chip, SectionHeading, GLASS } from "@/components/list-detail/ui";
import { countryNameFa } from "@/lib/country";
import { entityHref } from "@/lib/list-constellation";
import RelatedEntities from "@/components/RelatedEntities";
import DirectorWorks from "@/components/DirectorWorks";
import EntityBattle from "@/components/EntityBattle";
import EntityGraphWithSidebar from "@/components/EntityGraphWithSidebar";
import EntityOverviewGraph, { OverviewPerson } from "@/components/EntityOverviewGraph";
import { getMovieBySlug, getRelatedEntities, getMovieRankings, getPersonBySlug, getEgoGraph, EgoGraph, RelatedEntity, RankingHighlight, isNotFoundError } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { MovieListItem } from "@/lib/types";
import EntityExtras from "@/components/entities/entity-extras";
import JsonLd from "@/components/JsonLd";
import { movieJsonLd, movieMetadata } from "@/lib/seo";

// One API read shared by generateMetadata and the page.
const loadMovie = cache((slug: string) => getMovieBySlug(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    return movieMetadata(await loadMovie(slug), `/movies/${slug}`);
  } catch (err) {
    if (isNotFoundError(err)) return { title: "فیلم پیدا نشد", robots: { index: false, follow: false } };
    return {};
  }
}

export const revalidate = 3600;

// No paths are prerendered at build; each one is rendered on its first
// visit and then served from the ISR cache. Without this export the route
// is fully dynamic and `revalidate` above only affects the fetch cache.
export async function generateStaticParams() {
  return [];
}

// Genre chips over the hero's poster glow: the usual teal outline on a dark
// glass fill, so they don't vanish over a teal or blue poster.
const HERO_GENRE_CHIP = "border-teal/50 bg-[#0A0F18]/55 text-teal backdrop-blur-md hover:border-teal";

export default async function MovieDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Each backend read costs ~1.5s (DB round trips), so reads are issued as
  // soon as their input is known instead of one after another: rankings
  // only need the URL slug, related/director only need the movie.
  const rankingsPromise = getMovieRankings(slug).catch((): RankingHighlight[] => []);
  const egoPromise = getEgoGraph(slug).catch((): EgoGraph | null => null);
  let movie;
  try {
    movie = await loadMovie(slug);
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
  let battlePool: MovieListItem[] = [];
  const [related, rankingHighlights, ego, directorWorks] = await Promise.all([
    getRelatedEntities(movieId).catch((): RelatedEntity[] => []),
    rankingsPromise,
    egoPromise,
    mainDirector
      ? getPersonBySlug(mainDirector.slug)
          .then((director) => {
            // A person can appear in both `directed` and `created` (e.g. a
            // director who also created a show) -- dedupe by id so
            // DirectorWorks' key={item.id} never collides.
            const combined = [...director.directed, ...director.created];
            const unique = [...new Map(combined.map((m) => [m.id, m])).values()];
            battlePool = [...unique, ...director.acted_in].filter((m) => m.id !== movieId);
            return unique.filter((m) => m.id !== movieId);
          })
          .catch((): MovieListItem[] => [])
      : Promise.resolve<MovieListItem[]>([]),
  ]);

  const overviewPeople: OverviewPerson[] = [
    ...movie.directors.map((person): OverviewPerson => ({ person, credits: ["directed_by"] })),
    ...movie.cast.map((person): OverviewPerson => ({ person, credits: ["acted_in"] })),
  ];

  return (
    <div className="relative isolate">
      <AmbientGlow posterPath={movie.poster_path} />
    <main className="mx-auto max-w-7xl px-6 py-14">
      <JsonLd data={movieJsonLd(movie, `/movies/${slug}`)} />
      <Link href="/" className="text-sm text-white/60 hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {/* Deliberately bigger than any related-entity card so the title's
            own poster always reads as the primary image on the page. */}
        <DetailPoster entityId={movie.id} posterPath={movie.poster_path} alt={displayTitle(movie)} />

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
                  <span className="text-xs text-white/60">فیلم</span>
                </div>
              </div>

              <h1 className="text-[30px] font-black leading-[1.35] text-ink [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] lg:text-[56px] lg:leading-[1.2]">
                {movie.title_fa ?? movie.title}.
              </h1>
              {movie.title_fa && (
                <p dir="ltr" className="block text-right text-2xl font-black leading-[1.2] text-white/70 [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] lg:text-[44px]">
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
            <Chip tone={`${GLASS} font-bold tracking-[0.08em] text-ink`}>
              <span className="num">{toFaDigits(movie.year ?? "-")}</span>
            </Chip>
            {movie.runtime != null && (
              <Chip tone={`${GLASS} text-ink`}>
                <span className="num">{toFaDigits(movie.runtime)}</span> دقیقه
              </Chip>
            )}
            {countryNameFa(movie.country) && (
              <Chip tone={`${GLASS} text-ink`}>{countryNameFa(movie.country)}</Chip>
            )}
            {movie.genres.map((g) => (
              <Chip key={g.id} href={entityHref("genre", g.slug)} tone={HERO_GENRE_CHIP}>
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
            <WatchedButton entityId={movie.id} slug={movie.slug} />
            <BattleJumpButton />
          </div>

          <WatchLinks links={movie.watch_links ?? []} />

          {movie.overview && (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <MonoLabel size="text-[10px]" className="text-white/55">
                  SUMMARY
                </MonoLabel>
                <span className="text-xs text-white/60">خلاصه</span>
              </div>
              <p className="mt-2 text-[17px] leading-[2] text-ink/90 lg:text-[17px]">{movie.overview}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-16">
        <EntityGraphWithSidebar
          entityType="movie"
          overview={
            <EntityOverviewGraph
              self={{
                id: movie.id,
                slug: movie.slug,
                title: movie.title,
                title_fa: movie.title_fa ?? null,
                entity_type: "movie",
                year: movie.year ?? null,
                score: movie.computed_score ?? null,
                image_url: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
                role: "center",
              }}
              initial={ego}
              people={overviewPeople}
              genres={movie.genres}
            />
          }
          rankingHighlights={rankingHighlights}
          entityId={movie.id}
          aboveGraph={
            movie.trailer_key || movie.aparat_trailer ? (
              <section aria-label="تریلر">
                <SectionHeading en="TRAILER" fa="تریلر" />
                <div className="mt-4">
                  <TrailerPlayer youtubeKey={movie.trailer_key} aparatKey={movie.aparat_trailer} title={displayTitle(movie)} />
                </div>
              </section>
            ) : undefined
          }
          belowGraph={
            <>
              {mainDirector && (
                <DirectorWorks directorName={mainDirector.title_fa ?? mainDirector.title} directorSlug={mainDirector.slug} items={directorWorks} />
              )}
              <RelatedEntities items={related} excludeIds={directorWorks.map((w) => w.id)} />
            </>
          }
          battle={
            <EntityBattle
              current={movie}
              opponents={[...new Map(battlePool.map((m) => [m.id, m])).values()]}
              label={mainDirector ? `آثار ${mainDirector.title_fa ?? mainDirector.title}` : "آثار"}
            />
          }
        />
      </div>

      <EntityExtras entityId={movie.id} />

      <footer className="mt-14 flex flex-col gap-2 border-t border-border-soft pb-4 pt-6 text-xs leading-[1.8] text-dim lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:text-[13px]">
        <span>امتیاز ترکیبی از رأی جامعه (میانگین بیزی)، روند محبوبیت و نتایج نبردها محاسبه می‌شود.</span>
        <Link href="/rankings" className="flex min-h-[44px] shrink-0 items-center text-violet-light hover:text-ink">
          روش امتیازدهی
        </Link>
      </footer>
    </main>
    </div>
  );
}
