import { cache } from "react";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import EntityExtras from "@/components/entities/entity-extras";
import { tvJsonLd, tvMetadata } from "@/lib/seo";
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
import { getTvSeriesBySlug, getRelatedEntities, getTvSeriesRankings, getPersonBySlug, getEgoGraph, EgoGraph, RelatedEntity, RankingHighlight, isNotFoundError } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { MovieListItem, PersonSummary } from "@/lib/types";

export const revalidate = 3600;

// One API read shared by generateMetadata and the page.
const loadTv = cache((slug: string) => getTvSeriesBySlug(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    return tvMetadata(await loadTv(slug), `/tv-series/${slug}`);
  } catch (err) {
    if (isNotFoundError(err)) return { title: "سریال پیدا نشد", robots: { index: false, follow: false } };
    return {};
  }
}

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
// Creators first (marked as directors too when they are), then directors, then cast.
function overviewCredits(creators: PersonSummary[], directors: PersonSummary[], cast: PersonSummary[]): OverviewPerson[] {
  const directorIds = new Set(directors.map((d) => d.id));
  return [
    ...creators.map((person): OverviewPerson => ({ person, credits: directorIds.has(person.id) ? ["directed_by", "creator"] : ["creator"] })),
    ...directors.map((person): OverviewPerson => ({ person, credits: ["directed_by"] })),
    ...cast.map((person): OverviewPerson => ({ person, credits: ["acted_in"] })),
  ];
}

// Genre chips over the hero's poster glow: the usual teal outline on a dark
// glass fill, so they don't vanish over a teal or blue poster.
const HERO_GENRE_CHIP = "border-teal/50 bg-[#0A0F18]/55 text-teal backdrop-blur-md hover:border-teal";

export default async function TvSeriesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Each backend read costs ~1.5s (DB round trips), so reads are issued as
  // soon as their input is known instead of one after another: rankings
  // only need the URL slug, related/creator only need the show.
  const rankingsPromise = getTvSeriesRankings(slug).catch((): RankingHighlight[] => []);
  const egoPromise = getEgoGraph(slug).catch((): EgoGraph | null => null);
  let tv;
  try {
    tv = await loadTv(slug);
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
  let battlePool: MovieListItem[] = [];
  const [related, rankingHighlights, ego, creatorWorks] = await Promise.all([
    getRelatedEntities(tvId).catch((): RelatedEntity[] => []),
    rankingsPromise,
    egoPromise,
    mainCreator
      ? getPersonBySlug(mainCreator.slug)
          .then((creator) => {
            // A person can appear in both `directed` and `created` (e.g. a
            // director who also created a show) -- dedupe by id so
            // DirectorWorks' key={item.id} never collides.
            const combined = [...creator.directed, ...creator.created];
            const unique = [...new Map(combined.map((m) => [m.id, m])).values()];
            battlePool = [...unique, ...creator.acted_in].filter((m) => m.id !== tvId);
            return unique.filter((m) => m.id !== tvId);
          })
          .catch((): MovieListItem[] => [])
      : Promise.resolve<MovieListItem[]>([]),
  ]);

  const startYear = tv.first_air_date ? tv.first_air_date.slice(0, 4) : null;
  const isOngoing = tv.status ? ONGOING_STATUSES.has(tv.status) : false;
  const endYear = !isOngoing && tv.last_air_date ? tv.last_air_date.slice(0, 4) : null;
  const overviewPeople = overviewCredits(tv.creators, tv.directors, tv.cast);

  return (
    <div className="relative isolate">
      <AmbientGlow posterPath={tv.poster_path} />
    <main className="mx-auto max-w-7xl px-6 py-14">
      <JsonLd data={tvJsonLd(tv, `/tv-series/${slug}`)} />
      <Link href="/" className="text-sm text-white/60 hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {/* Deliberately bigger than any related-entity card so the title's
            own poster always reads as the primary image on the page. */}
        <DetailPoster entityId={tv.id} posterPath={tv.poster_path} alt={displayTitle(tv)} />

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
                  <span className="text-xs text-white/60">سریال</span>
                </div>
              </div>

              <h1 className="text-[30px] font-black leading-[1.35] text-ink [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] lg:text-[56px] lg:leading-[1.2]">
                {tv.title_fa ?? tv.title}.
              </h1>
              {tv.title_fa && (
                <p dir="ltr" className="block text-right text-2xl font-black leading-[1.2] text-white/70 [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] lg:text-[44px]">
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
              <Chip tone={`${GLASS} text-ink`}>
                <span className="num">{toFaDigits(tv.number_of_seasons)}</span> فصل
              </Chip>
            )}
            {startYear && (
              <Chip tone={`${GLASS} font-bold tracking-[0.08em] text-ink`}>
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
            {countryNameFa(tv.country) && (
              <Chip tone={`${GLASS} text-ink`}>{countryNameFa(tv.country)}</Chip>
            )}
            {tv.genres.map((g) => (
              <Chip key={g.id} href={entityHref("genre", g.slug)} tone={HERO_GENRE_CHIP}>
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
            entityId={tv.id}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AddToListMenu entity={tv} />
            <WatchedButton entityId={tv.id} slug={tv.slug} />
            <BattleJumpButton />
          </div>

          <WatchLinks links={tv.watch_links ?? []} />

          {tv.overview && (
            <div className="mt-6">
              <div className="flex items-center gap-2">
                <MonoLabel size="text-[10px]" className="text-white/55">
                  SUMMARY
                </MonoLabel>
                <span className="text-xs text-white/60">خلاصه</span>
              </div>
              <p className="mt-2 text-[17px] leading-[2] text-ink/90 lg:text-[17px]">{tv.overview}</p>
            </div>
          )}

          {tv.networks.length > 0 && (
            <div className="mt-6 flex flex-col items-start gap-2">
              <MonoLabel size="text-[10px]" className="text-white/55">
                NETWORKS · شبکه پخش
              </MonoLabel>
              <div className="flex flex-wrap gap-1.5">
                {tv.networks.map((n) => (
                  <Chip key={n.id} tone={`${GLASS} text-ink`}>
                    {n.title}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-16">
        <EntityGraphWithSidebar
          entityType="tv_series"
          overview={
            <EntityOverviewGraph
              self={{
                id: tv.id,
                slug: tv.slug,
                title: tv.title,
                title_fa: tv.title_fa ?? null,
                entity_type: "tv_series",
                year: startYear ? Number(startYear) : null,
                score: tv.computed_score ?? null,
                image_url: tv.poster_path ? `https://image.tmdb.org/t/p/w342${tv.poster_path}` : null,
                role: "center",
              }}
              initial={ego}
              people={overviewPeople}
              genres={tv.genres}
            />
          }
          rankingHighlights={rankingHighlights}
          entityId={tv.id}
          aboveGraph={
            tv.trailer_key || tv.aparat_trailer ? (
              <section aria-label="تریلر">
                <SectionHeading en="TRAILER" fa="تریلر" />
                <div className="mt-4">
                  <TrailerPlayer youtubeKey={tv.trailer_key} aparatKey={tv.aparat_trailer} title={displayTitle(tv)} />
                </div>
              </section>
            ) : undefined
          }
          belowGraph={
            <>
              {mainCreator && (
                <DirectorWorks directorName={mainCreator.title_fa ?? mainCreator.title} directorSlug={mainCreator.slug} items={creatorWorks} />
              )}
              <RelatedEntities items={related} excludeIds={creatorWorks.map((w) => w.id)} />
            </>
          }
          battle={
            <EntityBattle
              current={tv}
              opponents={[...new Map(battlePool.map((m) => [m.id, m])).values()]}
              label={mainCreator ? `آثار ${mainCreator.title_fa ?? mainCreator.title}` : "آثار"}
            />
          }
        />
      </div>

      <EntityExtras entityId={tv.id} />

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
