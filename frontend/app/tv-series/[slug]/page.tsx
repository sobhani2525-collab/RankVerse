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
import { getTvSeriesBySlug, getRelatedEntities, getTvSeriesRankings, getPersonBySlug, RelatedEntity, RankingHighlight, isNotFoundError } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { MovieListItem, PersonSummary, SuggestedBattle } from "@/lib/types";

export const revalidate = 3600;

// No paths are prerendered at build; each one is rendered on its first
// visit and then served from the ISR cache. Without this export the route
// is fully dynamic and `revalidate` above only affects the fetch cache.
export async function generateStaticParams() {
  return [];
}

// Statuses TMDb still considers "not finished" -- everything else (Ended,
// Canceled) gets its actual end year shown instead.
const ONGOING_STATUSES = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);

/**
 * Creators and directors as PEOPLE rows for the GRAPH section, one row per
 * role. Someone who is both lands in a single "سازنده و کارگردان" row
 * instead of being listed twice.
 */
function creditRows(creators: PersonSummary[], directors: PersonSummary[]) {
  const directorIds = new Set(directors.map((d) => d.id));
  const creatorIds = new Set(creators.map((c) => c.id));
  return [
    { label: "سازنده", people: creators.filter((c) => !directorIds.has(c.id)) },
    { label: "سازنده و کارگردان", people: creators.filter((c) => directorIds.has(c.id)) },
    { label: "کارگردان", people: directors.filter((d) => !creatorIds.has(d.id)) },
  ].filter((row) => row.people.length > 0);
}

export default async function TvSeriesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Each backend read costs ~1.5s (DB round trips), so reads are issued as
  // soon as their input is known instead of one after another: rankings
  // only need the URL slug, related/creator only need the show.
  const rankingsPromise = getTvSeriesRankings(slug).catch((): RankingHighlight[] => []);
  let tv;
  try {
    tv = await getTvSeriesBySlug(slug);
  } catch (err) {
    // Only a real 404 is a 404: a timeout or 5xx rethrows, so ISR keeps
    // the last good page instead of caching "not found" for an hour.
    if (isNotFoundError(err)) notFound();
    throw err;
  }

  // Powers both the "ساخته‌های دیگر X" section and, when there's no
  // personalized suggested-battle pick (every guest, or a logged-in user
  // without a taste anchor), the fallback battle below -- this show vs.
  // the creator's own next-best-scored other title, so the card has
  // something to show instead of nothing. Shows without a TMDb created_by
  // (common for Iranian series) fall back to their main director.
  const mainCreator = tv.creators[0] ?? tv.directors[0] ?? null;
  const tvId = tv.id;
  const [related, rankingHighlights, creatorWorks] = await Promise.all([
    getRelatedEntities(tvId).catch((): RelatedEntity[] => []),
    rankingsPromise,
    mainCreator
      ? getPersonBySlug(mainCreator.slug)
          .then((creator) => {
            // A person can appear in both `directed` and `created` (e.g. a
            // director who also created a show) -- dedupe by id so
            // DirectorWorks' key={item.id} never collides.
            const combined = [...creator.directed, ...creator.created];
            const unique = [...new Map(combined.map((m) => [m.id, m])).values()];
            return unique.filter((m) => m.id !== tvId);
          })
          .catch((): MovieListItem[] => [])
      : Promise.resolve<MovieListItem[]>([]),
  ]);
  const fallbackBattle: SuggestedBattle | null =
    mainCreator && creatorWorks.length > 0
      ? {
          category: "tv_series",
          left: {
            id: creatorWorks[0].id,
            slug: creatorWorks[0].slug,
            title: creatorWorks[0].title,
            title_fa: creatorWorks[0].title_fa,
            entity_type: creatorWorks[0].entity_type,
            poster_path: creatorWorks[0].poster_path,
            computed_score: creatorWorks[0].computed_score,
          },
          right: {
            id: tv.id,
            slug: tv.slug,
            title: tv.title,
            title_fa: tv.title_fa,
            entity_type: tv.entity_type,
            poster_path: tv.poster_path,
            computed_score: tv.computed_score,
          },
        }
      : null;

  const posterUrl = tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null;

  const startYear = tv.first_air_date ? tv.first_air_date.slice(0, 4) : null;
  const isOngoing = tv.status ? ONGOING_STATUSES.has(tv.status) : false;
  const endYear = !isOngoing && tv.last_air_date ? tv.last_air_date.slice(0, 4) : null;
  const peopleRows = creditRows(tv.creators, tv.directors);

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {/* Deliberately bigger than any related-entity card (max ~227px wide
            at the lg:grid-cols-5 breakpoint of a max-w-7xl page) so the
            show's own poster always reads as the primary image on the page. */}
        <div className="h-[480px] w-80 shrink-0 overflow-hidden rounded-xl bg-surface2 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={displayTitle(tv)}
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
                    SERIES
                  </MonoLabel>
                  <span className="text-xs text-muted">سریال</span>
                </div>
              </div>

              <h1 className="text-[30px] font-black leading-[1.35] text-ink lg:text-[56px] lg:leading-[1.2]">
                {tv.title_fa ?? tv.title}.
              </h1>
              {tv.title_fa && (
                <p dir="ltr" className="inline-block text-2xl font-black leading-[1.2] text-dim lg:text-[44px]">
                  {tv.title}.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DetailFavoriteButton entity={tv} size={48} shape="square" />
              <DetailShareButton entity={tv} title={displayTitle(tv)} size={48} shape="square" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {tv.number_of_seasons != null && (
              <Chip tone="border-border bg-surface-2 text-ink">
                <span className="num">{toFaDigits(tv.number_of_seasons)}</span> فصل
              </Chip>
            )}
            {startYear && (
              <Chip tone="border-border bg-surface-2 font-bold tracking-[0.08em] text-ink">
                {isOngoing ? (
                  <>
                    <span className="num">{toFaDigits(startYear)}</span>–در حال پخش
                  </>
                ) : endYear && endYear !== startYear ? (
                  <span className="num">
                    {toFaDigits(startYear)}–{toFaDigits(endYear)}
                  </span>
                ) : (
                  <span className="num">{toFaDigits(startYear)}</span>
                )}
              </Chip>
            )}
            {tv.genres.map((g) => (
              <Chip key={g.id} href={entityHref("genre", g.slug)} tone={GENRE_CHIP}>
                {genreLabel(g.title)}
              </Chip>
            ))}
          </div>

          <EntityScoreRow
            score={tv.computed_score}
            imdbId={tv.imdb_id}
            imdbRating={tv.imdb_rating}
            imdbVotes={tv.imdb_votes}
            ratingEntity={tv}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AddToListMenu entity={tv} />
            <BattleJumpButton />
          </div>

          {tv.overview && (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <MonoLabel size="text-[10px]" className="text-dim">
                  OVERVIEW
                </MonoLabel>
                <span className="text-xs text-muted">خلاصه</span>
              </div>
              <p className="mt-2 text-[17px] leading-[2] text-ink/90 lg:text-[17px]">{tv.overview}</p>
            </div>
          )}

          {tv.networks.length > 0 && (
            <div className="mt-6 flex flex-col items-start gap-2">
              <MonoLabel size="text-[10px]" className="text-dim">
                NETWORKS · شبکه پخش
              </MonoLabel>
              <div className="flex flex-wrap gap-1.5">
                {tv.networks.map((n) => (
                  <Chip key={n.id} tone="border-border bg-surface-2 text-ink">
                    {n.title}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-10">
        <EntityGraphWithSidebar
          entityType="tv_series"
          peopleRows={peopleRows}
          cast={tv.cast}
          genres={tv.genres}
          year={startYear ? Number(startYear) : null}
          rankingHighlights={rankingHighlights}
          entityId={tv.id}
        />
      </div>

      <div className="mt-10">
        <BattleSection
          entityType="tv_series"
          slug={tv.slug}
          fallbackBattle={fallbackBattle}
          directorName={mainCreator?.title ?? null}
        />
      </div>

      {mainCreator && (
        <div className="mt-10">
          <DirectorWorks directorName={mainCreator.title} directorSlug={mainCreator.slug} items={creatorWorks} />
        </div>
      )}

      <div className="mt-10">
        <RelatedEntities items={related} excludeIds={creatorWorks.map((w) => w.id)} />
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
