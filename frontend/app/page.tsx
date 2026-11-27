import type { Metadata } from "next";
import { Suspense } from "react";
import HomeHero from "@/components/home/HomeHero";
import HomeDiscovery from "@/components/home/HomeDiscovery";
import { HomePicksProvider } from "@/components/home/HomePicks";
import HomeBattleRows from "@/components/home/HomeBattleRows";
import TasteBand from "@/components/home/TasteBand";
import SimilarTasters from "@/components/home/SimilarTasters";
import SuggestedPairCard from "@/components/home/SuggestedPairCard";
import DailyBattle from "@/components/home/DailyBattle";
import HomeLists from "@/components/home/HomeLists";
import BackToTop from "@/components/BackToTop";
import {
  getRankingsPage, getHeroGraphs, getListsTotal, getBattlesTotal, getPeoplePage, getMovieBySlug, discoverLists, getListBySlugCached, getFeaturedLists, LISTS_CACHE_TAG, RANKING_TTL,
} from "@/lib/api";
import { toHomeTitle } from "@/lib/home-data";
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

const OTHER_FEATURED = 6;

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
    return { main: await getListBySlugCached(featured[0].slug), others: featured.slice(1, 1 + OTHER_FEATURED) };
  }
  const [popular] = await discoverLists({ sort: "popular", page_size: 1 }, RANKING_TTL, [LISTS_CACHE_TAG]);
  return { main: popular ? await getListBySlugCached(popular.slug) : null, others: [] };
}

export default function HomePage() {
  const moviePage = getRankingsPage("movie", { page_size: MOVIE_WINDOW });
  return (
    <main className="bg-[#0b0d1c]">
      <HomePicksProvider>
        <HomeDiscovery />
        <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6" role="status">در حال بارگذاری کهکشان…</div>}>
          <HomeGalaxy moviePage={moviePage} />
        </Suspense>
        <Suspense fallback={<p className="mx-auto max-w-7xl px-6 py-10 text-muted" role="status">در حال دریافت محتوای سینماگزین…</p>}>
          <HomeSections moviePage={moviePage} />
        </Suspense>
      </HomePicksProvider>
    </main>
  );
}

async function HomeGalaxy({ moviePage }: { moviePage: ReturnType<typeof getRankingsPage> }) {
  const [movies, tv, graphs, lists, people, battles] = await Promise.allSettled([
    moviePage,
    getRankingsPage("tv_series", { page_size: 10 }),
    getHeroGraphs(),
    getListsTotal(),
    getPeoplePage({ page_size: 1 }),
    getBattlesTotal(),
  ]);
  return (
    <HomeHero
      graphs={graphs.status === "fulfilled" ? graphs.value : []}
      movieTotal={movies.status === "fulfilled" ? movies.value.total : null}
      tvTotal={tv.status === "fulfilled" ? tv.value.total : null}
      listTotal={lists.status === "fulfilled" ? lists.value : null}
      artistTotal={people.status === "fulfilled" ? people.value.total : null}
      battleTotal={battles.status === "fulfilled" ? battles.value : null}
    />
  );
}

async function HomeSections({ moviePage }: { moviePage: ReturnType<typeof getRankingsPage> }) {
  // Independent reads, fetched together; each failure only hides its own
  // section (movies failing shows the error state below). The movie
  // details chain off the movie list alone, so they don't wait for the
  // other two reads.
  const [movieRes, extrasRes, featuredListRes] = await Promise.allSettled([
    moviePage,
    moviePage.then((page) => fetchDetails(page.items.slice(0, DETAILED).map((m) => m.slug))),
    // فهرست‌های برگزیدهٔ ادمین؛ اگر نبود، پرلایک‌ترین فهرست باکیفیت (فیلتر کیفیت پیش‌فرض بک‌اند).
    loadFeatured(),
  ]);

  const movies: MovieListItem[] = movieRes.status === "fulfilled" ? movieRes.value.items : [];
  if (movieRes.status === "rejected") rethrowOutsideBuild(movieRes.reason);
  const loadError =
    movieRes.status === "rejected"
      ? movieRes.reason instanceof Error
        ? movieRes.reason.message
        : "خطا در دریافت اطلاعات"
      : null;
  const featuredList = featuredListRes.status === "fulfilled" ? featuredListRes.value.main : null;
  const otherFeatured = featuredListRes.status === "fulfilled" ? featuredListRes.value.others : [];

  const extras = extrasRes.status === "fulfilled" ? extrasRes.value : { details: [] };
  const detailById = new Map<string, MovieDetail>();
  extras.details.forEach((d) => detailById.set(d.id, d));

  const titles = movies.map((m, i) => toHomeTitle(m, i + 1, detailById.get(m.id)));
  const leader = titles[0] ?? null;

  if (loadError || !leader) {
    return (
      <>
        <TasteBand />
        <section className="mx-auto max-w-7xl px-6 py-14">
          {loadError ? (
            <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
              اتصال به CinemaGozin Core Engine برقرار نشد.
              <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
              هنوز فیلمی همگام‌سازی نشده. اولین sync را از طریق API انجام دهید.
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <TasteBand />
      <section className="mx-auto max-w-7xl px-6 py-14" aria-label="نبردها">
        <h2 className="mb-6 text-2xl font-extrabold text-ink">نبردها</h2>
        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <DailyBattle embedded />
          <div className="flex h-full flex-col justify-between gap-6">
            <HomeBattleRows>
              <SuggestedPairCard />
            </HomeBattleRows>
          </div>
        </div>
      </section>
      <SimilarTasters />
      <HomeLists featured={featuredList} initialPicked={otherFeatured} />
      <BackToTop />
    </>
  );
}
