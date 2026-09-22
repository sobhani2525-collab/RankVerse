import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DetailFavoriteButton from "@/components/entities/detail-favorite-button";
import DetailShareButton from "@/components/entities/detail-share-button";
import AddToListMenu from "@/components/entities/add-to-list-menu";
import ScoreBadge from "@/components/ScoreBadge";
import StarRating from "@/components/rating/StarRating";
import RelatedEntities from "@/components/RelatedEntities";
import BattleAndRankings from "@/components/BattleAndRankings";
import EntityLists from "@/components/EntityLists";
import { getTvSeriesBySlug, getRelatedEntities, getTvSeriesRankings, RelatedEntity, RankingHighlight } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

export const revalidate = 60;

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

export default async function TvSeriesDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let tv;
  try {
    tv = await getTvSeriesBySlug(slug);
  } catch {
    notFound();
  }

  let related: RelatedEntity[] = [];
  try {
    related = await getRelatedEntities(tv.id);
  } catch {
    related = [];
  }

  let rankingHighlights: RankingHighlight[] = [];
  try {
    rankingHighlights = await getTvSeriesRankings(tv.slug);
  } catch {
    rankingHighlights = [];
  }

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

          <div className="mt-4">
            <StarRating entity={tv} />
          </div>

          <div className="mt-3 flex justify-end">
            <AddToListMenu entity={tv} />
          </div>

          <div className="mt-4">
            <ScoreBadge score={tv.computed_score} />
          </div>

          {tv.overview && (
            <p className="mt-5 text-sm leading-relaxed text-ink/90">{tv.overview}</p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {tv.creators.length > 0 && (
              <div>
                <dt className="text-xs text-muted">سازنده</dt>
                <dd className="mt-1 text-ink">{tv.creators.map((c) => c.title).join("، ")}</dd>
              </div>
            )}
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

      <div className="mt-10">
        <BattleAndRankings entityType="tv_series" slug={tv.slug} rankingHighlights={rankingHighlights} />
      </div>

      <EntityLists entityId={tv.id} />
    </main>
  );
}
