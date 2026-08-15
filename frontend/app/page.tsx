import Hero from "@/components/Hero";
import RankingList from "@/components/RankingList";
import { getTopMovies } from "@/lib/api";

export const revalidate = 300;

export default async function HomePage() {
  let movies = [];
  let loadError: string | null = null;

  try {
    movies = await getTopMovies({ page_size: 20 });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
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
    </main>
  );
}
