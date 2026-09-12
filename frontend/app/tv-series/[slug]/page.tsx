import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Constellation from "@/components/Constellation";
import ScoreBadge from "@/components/ScoreBadge";
import RatingWidget from "@/components/RatingWidget";
import RelatedEntities from "@/components/RelatedEntities";
import NotableRankings from "@/components/NotableRankings";
import { getTvSeriesBySlug, getRelatedEntities, getTvSeriesRankings, RelatedEntity, RankingHighlight } from "@/lib/api";

export const revalidate = 60;

// Statuses TMDb still considers "not finished" -- everything else (Ended,
// Canceled) gets its actual end year shown instead.
const ONGOING_STATUSES = new Set(["Returning Series", "In Production", "Planned", "Pilot"]);

function seasonsAndYearsLabel(tv: {
  number_of_seasons: number | null;
  first_air_date: string | null;
  last_air_date: string | null;
  status: string | null;
}): string {
  const parts: string[] = [];
  if (tv.number_of_seasons) {
    parts.push(`${tv.number_of_seasons} فصل`);
  }

  const startYear = tv.first_air_date ? tv.first_air_date.slice(0, 4) : null;
  const isOngoing = tv.status ? ONGOING_STATUSES.has(tv.status) : false;
  const endYear = !isOngoing && tv.last_air_date ? tv.last_air_date.slice(0, 4) : null;

  if (startYear) {
    parts.push(isOngoing ? `${startYear}–در حال پخش` : endYear && endYear !== startYear ? `${startYear}–${endYear}` : startYear);
  }

  return parts.join(" · ");
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
  const mainCreator = tv.creators[0]?.title ?? null;
  const mainGenre = tv.genres[0]?.title ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex flex-col gap-8 sm:flex-row">
        <div className="h-72 w-48 shrink-0 overflow-hidden rounded-xl bg-surface2 sm:mx-0 mx-auto">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={tv.title}
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
              <h1 className="text-2xl font-bold text-ink">{tv.title}</h1>
              <p className="num mt-1 text-sm text-muted">{seasonsAndYearsLabel(tv)}</p>
            </div>
            <Constellation director={mainCreator} genre={mainGenre} year={tv.year} size={80} />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <ScoreBadge score={tv.computed_score} />
            <span className="num text-xs text-muted">{tv.total_votes} رای</span>
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
                <dd className="mt-1 text-ink">{tv.genres.map((g) => g.title).join("، ")}</dd>
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
        <RatingWidget slug={tv.slug} entityType="tv_series" />
      </div>

      <div className="mt-10">
        <RelatedEntities items={related} />
      </div>

      <div className="mt-10">
        <NotableRankings items={rankingHighlights} />
      </div>
    </main>
  );
}
