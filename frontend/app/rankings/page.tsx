import Link from "next/link";
import RankingList from "@/components/RankingList";
import { getRankingsPage, RankingsPage } from "@/lib/api";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

export const revalidate = 1800;

const PAGE_SIZE = 25;

type RankingType = "movie" | "tv_series";

function buildHref(type: RankingType, page: number, genre?: string): string {
  const qs = new URLSearchParams();
  if (type === "tv_series") qs.set("type", "tv_series");
  if (genre) qs.set("genre", genre);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/rankings?${s}` : "/rankings";
}

export default async function RankingsPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; genre?: string }>;
}) {
  const params = await searchParams;
  const type: RankingType = params.type === "tv_series" ? "tv_series" : "movie";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const genre = params.genre?.trim() || undefined;

  let result: RankingsPage = { items: [], total: null };
  let loadError: string | null = null;
  try {
    result = await getRankingsPage(type, { page, page_size: PAGE_SIZE, genre });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  const totalPages = result.total !== null ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : null;
  const hasNext = totalPages !== null ? page < totalPages : result.items.length === PAGE_SIZE;

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <p className="kicker text-teal/80">The universe, ranked</p>
      <h1 className="font-display mt-3 text-3xl text-ink sm:text-4xl">رتبه‌بندی کامل</h1>
      <p className="mt-2 text-sm text-muted">بر اساس امتیاز ترکیبی RankVerse — رأی کاربران به‌همراه داده‌های بیرونی.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-surface/60 p-1" role="tablist" aria-label="نوع رتبه‌بندی">
          {(
            [
              ["movie", "فیلم"],
              ["tv_series", "سریال"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value}
              href={buildHref(value, 1, genre)}
              role="tab"
              aria-selected={type === value}
              className={`rounded-full px-4 py-1.5 text-sm transition ${type === value ? "bg-gold/15 text-gold" : "text-muted hover:text-ink"}`}
            >
              {label}
            </Link>
          ))}
        </div>

        {genre && (
          <Link
            href={buildHref(type, 1)}
            className="inline-flex items-center gap-2 rounded-full border border-teal/40 bg-teal/10 px-3 py-1.5 text-sm text-teal transition hover:bg-teal/20"
            aria-label={`حذف فیلتر ژانر ${genreLabel(genre)}`}
          >
            ژانر: {genreLabel(genre)}
            <span aria-hidden="true">×</span>
          </Link>
        )}

        {result.total !== null && (
          <span className="text-xs text-muted">
            <span className="num">{toFaDigits(result.total)}</span> عنوان
          </span>
        )}
      </div>

      <div className="mt-8">
        {loadError ? (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
            اتصال به RankVerse Core Engine برقرار نشد.
            <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
          </div>
        ) : (
          <RankingList movies={result.items} startRank={(page - 1) * PAGE_SIZE + 1} />
        )}
      </div>

      {!loadError && (page > 1 || hasNext) && (
        <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={buildHref(type, page - 1, genre)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
              → قبلی
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted">
            صفحهٔ <span className="num">{toFaDigits(page)}</span>
            {totalPages !== null && (
              <>
                {" "}از <span className="num">{toFaDigits(totalPages)}</span>
              </>
            )}
          </span>
          {hasNext ? (
            <Link href={buildHref(type, page + 1, genre)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
              بعدی ←
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
