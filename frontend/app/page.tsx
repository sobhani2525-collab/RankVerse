import Link from "next/link";
import ListCard from "@/components/lists/list-card";
import HomeHero from "@/components/home/HomeHero";
import UniverseAnatomy from "@/components/home/UniverseAnatomy";
import LiveRanking from "@/components/home/LiveRanking";
import WhyNumberOne from "@/components/home/WhyNumberOne";
import KnowledgeGraphExplorer from "@/components/home/KnowledgeGraphExplorer";
import BattleArena from "@/components/home/BattleArena";
import VoteShift from "@/components/home/VoteShift";
import HomeSearch from "@/components/home/HomeSearch";
import BeyondTopTen from "@/components/home/BeyondTopTen";
import GenreUniverse from "@/components/home/GenreUniverse";
import PersonalUniverse from "@/components/home/PersonalUniverse";
import FinalCta from "@/components/home/FinalCta";
import SectionHeading from "@/components/home/SectionHeading";
import { getRankingsPage, getMovieBySlug, getMovieRankings, discoverLists, RankingHighlight } from "@/lib/api";
import { listSummaryToListCard } from "@/lib/entity-card-adapters";
import { clusterByGenre, toHomeTitle } from "@/lib/home-data";
import { MovieDetail, MovieListItem } from "@/lib/types";

export const revalidate = 300;

// Backend load per home render is kept small and bounded: 3 list reads in
// parallel, then detail fetches for only the top DETAILED movies, at most
// DETAIL_CONCURRENCY at a time, then the #1's ranking highlights. Details
// feed the hero constellation's edges, hover cards, ranking-row metadata
// and genre clusters; titles past DETAILED simply render without them.
const DETAILED = 6;
const DETAIL_CONCURRENCY = 3;
const HERO_NODES = 12;
const MOVIE_WINDOW = 24; // top 10 + "beyond the top 10"

/**
 * Fetches movie details in small sequential batches. If an entire batch
 * fails (e.g. every request timed out), the backend is struggling, so the
 * remaining batches are skipped rather than piling more requests onto it.
 */
async function fetchDetails(slugs: string[]): Promise<MovieDetail[]> {
  const out: MovieDetail[] = [];
  for (let i = 0; i < slugs.length; i += DETAIL_CONCURRENCY) {
    const batch = await Promise.allSettled(slugs.slice(i, i + DETAIL_CONCURRENCY).map((slug) => getMovieBySlug(slug)));
    const ok = batch.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    out.push(...ok);
    if (ok.length === 0) break;
  }
  return out;
}

export default async function HomePage() {
  // Independent reads, fetched together; each failure only hides its own
  // section (movies failing shows the error state below).
  const [movieRes, tvRes, listsRes] = await Promise.allSettled([
    getRankingsPage("movie", { page_size: MOVIE_WINDOW }),
    getRankingsPage("tv_series", { page_size: 10 }),
    // آخرین لیست‌های ساخته‌شده توسط کاربرها. اگه گرفتنش خطا بده،
    // این بخش بی‌سروصدا مخفی می‌شه و مانع لود بقیهٔ صفحه نمی‌شه.
    discoverLists({ sort: "newest", page_size: 6 }),
  ]);

  const movies: MovieListItem[] = movieRes.status === "fulfilled" ? movieRes.value.items : [];
  const movieTotal = movieRes.status === "fulfilled" ? movieRes.value.total : null;
  const loadError =
    movieRes.status === "rejected"
      ? movieRes.reason instanceof Error
        ? movieRes.reason.message
        : "خطا در دریافت اطلاعات"
      : null;
  const tvSeries: MovieListItem[] = tvRes.status === "fulfilled" ? tvRes.value.items : [];
  const tvTotal = tvRes.status === "fulfilled" ? tvRes.value.total : null;
  const latestLists = listsRes.status === "fulfilled" ? listsRes.value : [];

  const detailById = new Map<string, MovieDetail>();
  (await fetchDetails(movies.slice(0, DETAILED).map((m) => m.slug))).forEach((d) => detailById.set(d.id, d));

  const titles = movies.map((m, i) => toHomeTitle(m, i + 1, detailById.get(m.id)));
  const top10 = titles.slice(0, 10);
  const detailed = titles.filter((t) => t.hasDetail);
  const tvTitles = tvSeries.map((m, i) => toHomeTitle(m, i + 1));
  const leader = titles[0] ?? null;

  let highlights: RankingHighlight[] = [];
  // Skipped when no detail call succeeded -- the backend is likely down.
  if (leader?.hasDetail) {
    try {
      highlights = await getMovieRankings(leader.slug);
    } catch {
      highlights = [];
    }
  }

  const searchSuggestions = leader
    ? [leader.title_fa ?? leader.title, leader.directors[0]?.title, leader.genres[0]?.title].filter((s): s is string => !!s)
    : [];

  if (loadError || !leader) {
    return (
      <main>
        <HomeHero titles={[]} movieTotal={null} tvTotal={tvTotal} />
        <section className="mx-auto max-w-7xl px-6 py-14">
          {loadError ? (
            <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
              اتصال به RankVerse Core Engine برقرار نشد.
              <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
              هنوز فیلمی همگام‌سازی نشده. اولین sync را از طریق API انجام دهید.
            </div>
          )}
        </section>
        <HomeSearch suggestions={[]} />
      </main>
    );
  }

  return (
    <main>
      <HomeHero titles={titles.slice(0, HERO_NODES)} movieTotal={movieTotal} tvTotal={tvTotal} />
      {leader.hasDetail && <UniverseAnatomy title={leader} />}
      <LiveRanking movies={top10} tvSeries={tvTitles} />
      <WhyNumberOne leader={leader} rivals={titles.slice(1, 5)} highlights={highlights} />
      {leader.hasDetail && <KnowledgeGraphExplorer seed={leader} />}
      <BattleArena preview={titles.length >= 2 ? [titles[0], titles[1]] : null} />
      <VoteShift guestPreview={top10} />
      <HomeSearch suggestions={searchSuggestions} />
      <BeyondTopTen titles={titles.slice(10)} />
      <GenreUniverse clusters={clusterByGenre(detailed)} sampleSize={detailed.length} />
      <PersonalUniverse startHref={`/movies/${leader.slug}`} />

      {latestLists.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-24">
          <SectionHeading
            kicker="Curated by the community"
            title="آخرین لیست‌ها"
            action={
              <Link href="/lists" className="text-sm text-teal hover:underline">
                همه لیست‌ها
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {latestLists.map((list) => (
              <ListCard key={list.id} list={listSummaryToListCard(list)} />
            ))}
          </div>
        </section>
      )}

      <FinalCta />
    </main>
  );
}
