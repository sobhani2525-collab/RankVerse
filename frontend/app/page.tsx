import Link from "next/link";
import Hero from "@/components/Hero";
import RankingList from "@/components/RankingList";
import { getTopMovies, getTopTvSeries, discoverLists } from "@/lib/api";

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

      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-ink">برترین‌های امروز</h2>
          <span className="num text-xs text-muted">دسته: فیلم</span>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
            اتصال به RankVerse Core Engine برقرار نشد.
            <span className="num block text-xs mt-1 text-gold/70">{loadError}</span>
          </div>
        ) : (
          <RankingList movies={movies} />
        )}
      </section>

      {tvSeries.length > 0 && (
        <section className="mx-auto max-w-3xl px-6 pb-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-ink">برترین‌های سریال</h2>
            <span className="num text-xs text-muted">دسته: سریال</span>
          </div>

          <RankingList movies={tvSeries} />
        </section>
      )}

      {latestLists.length > 0 && (
        <section className="mx-auto max-w-3xl px-6 pb-14">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-ink">آخرین لیست‌ها</h2>
            <Link href="/lists" className="text-xs text-teal hover:underline">
              همه لیست‌ها
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {latestLists.map((list) => (
              <Link
                key={list.id ?? list.slug}
                href={`/lists/${list.slug}`}
                className="rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-teal/30"
              >
                <p className="truncate text-sm text-ink">{list.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {list.owner_username ?? list.username ?? "کاربر RankVerse"}
                  {typeof list.item_count === "number" && ` · ${list.item_count} مورد`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
