import type { Metadata } from "next";
import Link from "next/link";
import ListTicketCard from "@/components/lists/list-ticket-card";
import HomeHero from "@/components/home/HomeHero";
import LiveRanking from "@/components/home/LiveRanking";
import KnowledgeGraphExplorer from "@/components/home/KnowledgeGraphExplorer";
import BattleArena from "@/components/home/BattleArena";
import DailyBattle from "@/components/home/DailyBattle";
import VoteShift from "@/components/home/VoteShift";
import HomeSearch from "@/components/home/HomeSearch";
import FeaturedList from "@/components/home/FeaturedList";
import GenreUniverse from "@/components/home/GenreUniverse";
import PersonalUniverse from "@/components/home/PersonalUniverse";
import FinalCta from "@/components/home/FinalCta";
import SectionHeading from "@/components/home/SectionHeading";
import {
  getRankingsPage, getHeroGraphs, getMovieBySlug, discoverLists, getListBySlug, getFeaturedLists, LISTS_CACHE_TAG, RANKING_TTL,
} from "@/lib/api";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import { clusterByGenre, toHomeTitle } from "@/lib/home-data";
import { rethrowOutsideBuild } from "@/lib/isr";
import { ListDetail, ListSummary, MovieDetail, MovieListItem } from "@/lib/types";

export const revalidate = 1800;

export const metadata: Metadata = { alternates: { canonical: "/" } };

// Backend load per home render is kept small and bounded: 3 list reads in
// parallel; as soon as the movie list lands, detail fetches for only the
// top DETAILED movies, at most DETAIL_CONCURRENCY at a time. Details feed the
// hero constellation's edges, hover cards, ranking-row metadata and genre
// clusters; titles past DETAILED simply render without them.
const DETAILED = 6;
const DETAIL_CONCURRENCY = 3;
const HERO_NODES = 12;
const MOVIE_WINDOW = 24; // top 10 + "beyond the top 10"

/** Fetches movie details in small sequential batches; if an entire batch fails the backend is struggling, so the rest are skipped. */
async function fetchDetails(slugs: string[]): Promise<{ details: MovieDetail[] }> {
  const details: MovieDetail[] = [];
  for (let i = 0; i < slugs.length; i += DETAIL_CONCURRENCY) {
    const batch = await Promise.allSettled(slugs.slice(i, i + DETAIL_CONCURRENCY).map((slug) => getMovieBySlug(slug)));
    const ok = batch.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    details.push(...ok);
    if (ok.length === 0) break;
  }
  return { details };
}

const OTHER_FEATURED = 3;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The hero «Featured list» in full, plus up to OTHER_FEATURED more admin-featured lists as cards. */
async function loadFeatured(): Promise<{ main: ListDetail | null; others: ListSummary[] }> {
  // All featured lists, shuffled: the page is ISR-cached, so the pick changes each time it regenerates.
  const featured = shuffled(await getFeaturedLists(20));
  if (featured.length > 0) {
    return { main: await getListBySlug(featured[0].slug), others: featured.slice(1, 1 + OTHER_FEATURED) };
  }
  const [popular] = await discoverLists({ sort: "popular", page_size: 1 }, RANKING_TTL, [LISTS_CACHE_TAG]);
  return { main: popular ? await getListBySlug(popular.slug) : null, others: [] };
}

export default async function HomePage() {
  // Independent reads, fetched together; each failure only hides its own
  // section (movies failing shows the error state below). The movie
  // details chain off the movie list alone, so they don't wait for the
  // other two reads.
  const moviePage = getRankingsPage("movie", { page_size: MOVIE_WINDOW });
  const [movieRes, tvRes, listsRes, extrasRes, featuredListRes, heroPoolRes] = await Promise.allSettled([
    moviePage,
    getRankingsPage("tv_series", { page_size: 10 }),
    // آخرین فهرست‌های ساخته‌شده توسط کاربرها. اگه گرفتنش خطا بده،
    // این بخش بی‌سروصدا مخفی می‌شه و مانع لود بقیهٔ صفحه نمی‌شه.
    // Cached as long as the rest of the page, so this read doesn't pull the
    // whole home page down to the lists TTL.
    discoverLists({ sort: "newest", page_size: 6 }, RANKING_TTL, [LISTS_CACHE_TAG]),
    moviePage.then((page) => fetchDetails(page.items.slice(0, DETAILED).map((m) => m.slug))),
    // فهرست‌های برگزیدهٔ ادمین؛ اگر نبود، پرلایک‌ترین فهرست باکیفیت (فیلتر کیفیت پیش‌فرض بک‌اند).
    loadFeatured(),
    // Pre-indexed ego graphs for the hero; failure just means the hero
    // fetches them itself in the browser.
    getHeroGraphs(),
  ]);
  const heroGraphs = heroPoolRes.status === "fulfilled" ? heroPoolRes.value : [];

  const movies: MovieListItem[] = movieRes.status === "fulfilled" ? movieRes.value.items : [];
  const movieTotal = movieRes.status === "fulfilled" ? movieRes.value.total : null;
  if (movieRes.status === "rejected") rethrowOutsideBuild(movieRes.reason);
  const loadError =
    movieRes.status === "rejected"
      ? movieRes.reason instanceof Error
        ? movieRes.reason.message
        : "خطا در دریافت اطلاعات"
      : null;
  const tvSeries: MovieListItem[] = tvRes.status === "fulfilled" ? tvRes.value.items : [];
  const tvTotal = tvRes.status === "fulfilled" ? tvRes.value.total : null;
  const latestLists = listsRes.status === "fulfilled" ? listsRes.value : [];
  const featuredList = featuredListRes.status === "fulfilled" ? featuredListRes.value.main : null;
  const otherFeatured = featuredListRes.status === "fulfilled" ? featuredListRes.value.others : [];

  const extras = extrasRes.status === "fulfilled" ? extrasRes.value : { details: [] };
  const detailById = new Map<string, MovieDetail>();
  extras.details.forEach((d) => detailById.set(d.id, d));

  const titles = movies.map((m, i) => toHomeTitle(m, i + 1, detailById.get(m.id)));
  const top10 = titles.slice(0, 10);
  const detailed = titles.filter((t) => t.hasDetail);
  const tvTitles = tvSeries.map((m, i) => toHomeTitle(m, i + 1));
  const leader = titles[0] ?? null;

  const searchSuggestions = leader
    ? [leader.title_fa ?? leader.title, leader.directors[0]?.title, leader.genres[0]?.title].filter((s): s is string => !!s)
    : [];

  if (loadError || !leader) {
    return (
      <main>
        <HomeHero titles={[]} graphs={[]} movieTotal={null} tvTotal={tvTotal} />
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
      <HomeHero titles={titles.slice(0, HERO_NODES)} graphs={heroGraphs} movieTotal={movieTotal} tvTotal={tvTotal} />
      <DailyBattle />
      {leader.hasDetail && <KnowledgeGraphExplorer seed={leader} />}
      <LiveRanking movies={top10} tvSeries={tvTitles} />
      <BattleArena />
      <VoteShift guestPreview={top10} />
      <HomeSearch suggestions={searchSuggestions} />
      {featuredList && <FeaturedList list={featuredList} />}
      {otherFeatured.length > 0 && (
        <section className="mx-auto -mt-16 max-w-7xl px-6 pb-16">
          <h3 className="mb-5 text-lg font-bold text-ink">سایر فهرست‌های برگزیده</h3>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {otherFeatured.map((list) => (
              <ListTicketCard key={list.id} list={{ ...listSummaryToTicketCard(list), featured: false }} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/lists" className="text-sm text-teal hover:underline">
              مشاهدهٔ همهٔ فهرست‌ها ←
            </Link>
          </div>
        </section>
      )}
      <GenreUniverse clusters={clusterByGenre(detailed)} sampleSize={detailed.length} />
      <PersonalUniverse startHref={`/movies/${leader.slug}`} />

      {latestLists.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-24">
          <SectionHeading
            kicker="Curated by the community"
            title="آخرین فهرست‌ها"
            action={
              <Link href="/lists" className="text-sm text-teal hover:underline">
                همه فهرست‌ها
              </Link>
            }
          />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {latestLists.map((list) => (
              <ListTicketCard key={list.id} list={{ ...listSummaryToTicketCard(list), featured: false }} />
            ))}
          </div>
        </section>
      )}

      <FinalCta />
    </main>
  );
}
