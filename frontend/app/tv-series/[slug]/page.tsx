import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import ScoreBadge from "@/components/ScoreBadge";
import ImdbBadge from "@/components/ImdbBadge";
import StarRating from "@/components/rating/StarRating";
import RelatedEntities from "@/components/RelatedEntities";
import DirectorWorks from "@/components/DirectorWorks";
import BattleAndRankings from "@/components/BattleAndRankings";
import EntityLists from "@/components/EntityLists";
import { getTvSeriesBySlug, getRelatedEntities, getTvSeriesRankings, getPersonBySlug, RelatedEntity, RankingHighlight, isNotFoundError } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";
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
 * Returns JSX, not a string: the old version built one plain string ("8
 * فصل · 2011–2019") and rendered the WHOLE thing inside className="num"
 * (direction: ltr). That forced a Persian word ("فصل") and a dash-joined
 * year range into one LTR context together, and the bidi algorithm ended
 * up reordering the two numbers in the range too ("8 2019-2011 · فصل" as
 * rendered) -- same class of bug as the Taste DNA dimension-label mixup.
 *
 * The fix, verified with a screenshot: isolate each PURELY-numeric
 * fragment (the season count, the year-or-range) in its own .num span,
 * and leave the Persian words ("فصل", "در حال پخش") and the "·" separator
 * in plain, unforced flow -- don't wrap the whole compound in one
 * direction like the old version did.
 */
function SeasonsAndYears({
  tv,
}: {
  tv: {
    number_of_seasons: number | null;
    first_air_date: string | null;
    last_air_date: string | null;
    status: string | null;
  };
}) {
  const startYear = tv.first_air_date ? tv.first_air_date.slice(0, 4) : null;
  const isOngoing = tv.status ? ONGOING_STATUSES.has(tv.status) : false;
  const endYear = !isOngoing && tv.last_air_date ? tv.last_air_date.slice(0, 4) : null;

  const seasonsPart = tv.number_of_seasons ? (
    <>
      <span className="num">{toFaDigits(tv.number_of_seasons)}</span> فصل
    </>
  ) : null;

  let yearsPart: React.ReactNode = null;
  if (startYear) {
    if (isOngoing) {
      yearsPart = (
        <>
          <span className="num">{toFaDigits(startYear)}</span>–در حال پخش
        </>
      );
    } else if (endYear && endYear !== startYear) {
      yearsPart = <span className="num">{toFaDigits(startYear)}–{toFaDigits(endYear)}</span>;
    } else {
      yearsPart = <span className="num">{toFaDigits(startYear)}</span>;
    }
  }

  if (!seasonsPart && !yearsPart) return null;

  return (
    <p className="mt-1 text-sm text-muted">
      {seasonsPart}
      {seasonsPart && yearsPart && " · "}
      {yearsPart}
    </p>
  );
}

/**
 * Creators and directors as linked name lists, one row per role. Someone
 * who is both lands in a single "سازنده و کارگردان" row instead of being
 * listed twice.
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

function PersonLinks({ people }: { people: PersonSummary[] }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && "، "}
          <Link href={detailPathFor("person", p.slug)!} className="hover:text-gold">
            {p.title}
          </Link>
        </span>
      ))}
    </>
  );
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
          .then((creator) => [...creator.directed, ...creator.created].filter((m) => m.id !== tvId))
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

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        {/* Deliberately bigger than any related-entity card (max ~227px wide
            at the lg:grid-cols-5 breakpoint of a max-w-7xl page) so the
            show's own poster always reads as the primary image on the page. */}
        <div className="h-96 w-64 shrink-0 overflow-hidden rounded-xl bg-surface2 sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={displayTitle(tv)}
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
              <h1 className="font-display text-2xl text-ink">{displayTitle(tv)}</h1>
              <SeasonsAndYears tv={tv} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DetailFavoriteButton entity={tv} size={44} />
              <DetailShareButton entity={tv} title={displayTitle(tv)} size={44} />
            </div>
          </div>

          {/* #rate: the list page's "امتیاز بده" links land here. */}
          <div id="rate" className="mt-4 scroll-mt-24">
            <StarRating entity={tv} />
          </div>

          <div className="mt-3 flex justify-end">
            <AddToListMenu entity={tv} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ScoreBadge score={tv.computed_score} />
            <ImdbBadge imdbId={tv.imdb_id} rating={tv.imdb_rating} votes={tv.imdb_votes} />
          </div>

          {tv.overview && (
            <p className="mt-5 text-sm leading-relaxed text-ink/90">{tv.overview}</p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {creditRows(tv.creators, tv.directors).map((row) => (
              <div key={row.label}>
                <dt className="text-xs text-muted">{row.label}</dt>
                <dd className="mt-1 text-ink">
                  <PersonLinks people={row.people} />
                </dd>
              </div>
            ))}
            {tv.genres.length > 0 && (
              <div>
                <dt className="text-xs text-muted">ژانر</dt>
                <dd className="mt-1 text-ink">{tv.genres.map((g) => genreLabel(g.title)).join("، ")}</dd>
              </div>
            )}
            {tv.networks.length > 0 && (
              <div>
                <dt className="text-xs text-muted">شبکه پخش</dt>
                <dd className="mt-1 text-ink">{tv.networks.map((n) => n.title).join("، ")}</dd>
              </div>
            )}
            {tv.cast.length > 0 && (
              <div className="col-span-2">
                <dt className="text-xs text-muted">بازیگران</dt>
                <dd className="mt-1 text-ink">{tv.cast.map((c) => c.title).join("، ")}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="mt-10">
        <RelatedEntities items={related} />
      </div>

      {mainCreator && (
        <div className="mt-10">
          <DirectorWorks directorName={mainCreator.title} items={creatorWorks} />
        </div>
      )}

      <div className="mt-10">
        <BattleAndRankings
          entityType="tv_series"
          slug={tv.slug}
          rankingHighlights={rankingHighlights}
          fallbackBattle={fallbackBattle}
        />
      </div>

      <EntityLists entityId={tv.id} />
    </main>
  );
}
