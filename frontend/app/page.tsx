import Link from "next/link";
import Hero from "@/components/Hero";
import FavoriteEntityCard from "@/components/entities/favorite-entity-card";
import ListCard from "@/components/lists/list-card";
import { getTopMovies, getTopTvSeries, discoverLists } from "@/lib/api";
import { movieListItemToEntityCard, listSummaryToListCard } from "@/lib/entity-card-adapters";

export const revalidate = 300;

export default async function HomePage() {
  let movies: any[] = [];
  let loadError: string | null = null;

  try {
    movies = await getTopMovies({ page_size: 20 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  // Same tolerant pattern as movies above -- a failed fetch here shouldn't
  // take down the rest of the home page, it just hides this section.
  let tvSeries: any[] = [];
  try {
    tvSeries = await getTopTvSeries({ page_size: 20 });
  } catch {
    tvSeries = [];
  }

  // آخرین لیست‌های ساخته‌شده توسط کاربرها. اگه گرفتنش خطا بده،
  // این بخش بی‌سروصدا مخفی می‌شه و مانع لود بقیهٔ صفحه نمی‌شه.
  let latestLists: any[] = [];
  try {
    latestLists = await discoverLists({ sort: "newest", page_size: 6 });
  } catch {
    latestLists = [];
  }

  return (
    <main>
      <Hero />

      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-xl text-ink">برترین‌های امروز</h2>
          <span className="num text-xs text-muted">دسته: فیلم</span>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
            اتصال به RankVerse Core Engine برقرار نشد.
            <span className="num block text-xs mt-1 text-gold/70">{loadError}</span>
          </div>
        ) : movies.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
            هنوز فیلمی همگام‌سازی نشده. اولین sync را از طریق API انجام دهید.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
            {movies.map((movie) => (
              <FavoriteEntityCard key={movie.id} entity={movieListItemToEntityCard(movie)} />
            ))}
          </div>
        )}
      </section>

      {tvSeries.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 pb-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="font-display text-xl text-ink">برترین‌های سریال</h2>
            <span className="num text-xs text-muted">دسته: سریال</span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
            {tvSeries.map((show) => (
              <FavoriteEntityCard key={show.id} entity={movieListItemToEntityCard(show)} />
            ))}
          </div>
        </section>
      )}

      {latestLists.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 pb-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="font-display text-xl text-ink">آخرین لیست‌ها</h2>
            <Link href="/lists" className="text-xs text-teal hover:underline">
              همه لیست‌ها
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {latestLists.map((list) => (
              <ListCard key={list.id} list={listSummaryToListCard(list)} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
