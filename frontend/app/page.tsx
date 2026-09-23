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

// How many of the top movies get a detail fetch (directors/genres/cast):
// they feed the hero constellation's edges, hover cards, the ranking rows'
// metadata and the genre clusters. Bounded so one home render stays at a
// fixed, small number of backend calls.
const DETAILED = 12;
const MOVIE_WINDOW = 24; // top 10 + "beyond the top 10"

export default async function HomePage() {
  let movies: MovieListItem[] = [];
  let movieTotal: number | null = null;
  let loadError: string | null = null;
  try {
    const page = await getRankingsPage("movie", { page_size: MOVIE_WINDOW });
    movies = page.items;
    movieTotal = page.total;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  // Same tolerant pattern as before: a failed fetch hides only its section.
  let tvSeries: MovieListItem[] = [];
  let tvTotal: number | null = null;
  try {
    const page = await getRankingsPage("tv_series", { page_size: 10 });
    tvSeries = page.items;
    tvTotal = page.total;
  } catch {
    tvSeries = [];
  }

  // آخرین لیست‌های ساخته‌شده توسط کاربرها. اگه گرفتنش خطا بده،
  // این بخش بی‌سروصدا مخفی می‌شه و مانع لود بقیهٔ صفحه نمی‌شه.
  let latestLists: Awaited<ReturnType<typeof discoverLists>> = [];
  try {
    latestLists = await discoverLists({ sort: "newest", page_size: 6 });
  } catch {
    latestLists = [];
  }

  const details = await Promise.allSettled(movies.slice(0, DETAILED).map((m) => getMovieBySlug(m.slug)));
  const detailById = new Map<string, MovieDetail>();
  details.forEach((d) => d.status === "fulfilled" && detailById.set(d.value.id, d.value));

  const titles = movies.map((m, i) => toHomeTitle(m, i + 1, detailById.get(m.id)));
  const top10 = titles.slice(0, 10);
  const detailed = titles.slice(0, DETAILED).filter((t) => t.hasDetail);
  const tvTitles = tvSeries.map((m, i) => toHomeTitle(m, i + 1));
  const leader = titles[0] ?? null;

  let highlights: RankingHighlight[] = [];
  if (leader) {
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
      <HomeHero titles={titles.slice(0, DETAILED)} movieTotal={movieTotal} tvTotal={tvTotal} />
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
