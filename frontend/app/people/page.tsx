import type { Metadata } from "next";
import Link from "next/link";
import PersonCard from "@/components/PersonCard";
import RankingFilters from "@/components/RankingFilters";
import { getPeoplePage } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";

export const revalidate = 1800;

const PAGE_SIZE = 24;

const ROLE_OPTIONS = [
  ["all", "همه"],
  ["director", "کارگردان"],
  ["actor", "بازیگر"],
  ["creator", "سازندهٔ سریال"],
] as const;

const ORIGIN_OPTIONS = [
  ["all", "همه"],
  ["persian", "فارسی‌زبان"],
  ["foreign", "خارجی"],
] as const;

const SORT_OPTIONS = [
  ["works", "بیشترین آثار"],
  ["score", "بالاترین میانگین امتیاز"],
] as const;

interface Filters {
  role?: string;
  sort?: string;
  origin?: string;
}

function buildHref(page: number, f: Filters = {}): string {
  const qs = new URLSearchParams();
  if (f.role && f.role !== "all") qs.set("role", f.role);
  if (f.origin && f.origin !== "all") qs.set("origin", f.origin);
  if (f.sort && f.sort !== "works") qs.set("sort", f.sort);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `/people?${s}` : "/people";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; role?: string; sort?: string; origin?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const role = ROLE_OPTIONS.find(([v]) => v === params.role && v !== "all");
  const filtered = (params.origin ?? "all") !== "all" || (params.sort !== undefined && params.sort !== "works");
  const canonical = buildHref(page, { role: role?.[0] });
  const base = role ? `${role[1]}‌های سینما` : "هنرمندان سینما";
  const title = page > 1 ? `${base} — صفحهٔ ${toFaDigits(page)}` : base;
  const description = "کارگردانان، بازیگران و سازندگان فیلم و سریال، بر اساس تعداد آثار و امتیاز آثارشان در سینماگزین.";
  return {
    title,
    description,
    alternates: { canonical },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: "website", url: canonical, siteName: SITE_NAME, locale: SITE_LOCALE, title, description },
  };
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; role?: string; sort?: string; origin?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const role = ROLE_OPTIONS.some(([v]) => v === params.role) ? params.role! : "all";
  const sort = SORT_OPTIONS.some(([v]) => v === params.sort) ? params.sort! : "works";
  const origin = ORIGIN_OPTIONS.some(([v]) => v === params.origin) ? params.origin! : "all";
  const filters: Filters = { role, sort, origin };

  let result: Awaited<ReturnType<typeof getPeoplePage>> = { items: [], total: null };
  let loadError: string | null = null;
  try {
    result = await getPeoplePage({ page, page_size: PAGE_SIZE, role, sort, origin });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  const totalPages = result.total !== null ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : null;
  const hasNext = totalPages !== null ? page < totalPages : result.items.length === PAGE_SIZE;

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <p className="kicker text-teal/80">The people behind the screen</p>
      <h1 className="font-display mt-3 text-3xl text-ink sm:text-4xl">هنرمندان</h1>
      <p className="mt-2 text-sm text-muted">کارگردانان، بازیگران و سازندگان، بر اساس تعداد آثار و امتیاز آثارشان در RankVerse.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <RankingFilters
          selects={[
            {
              label: "نقش:",
              en: "ROLE",
              value: role,
              options: ROLE_OPTIONS.map(([v, l]) => [v, l, buildHref(1, { ...filters, role: v })] as const),
            },
            {
              label: "زبان:",
              en: "LANGUAGE",
              value: origin,
              options: ORIGIN_OPTIONS.map(([v, l]) => [v, l, buildHref(1, { ...filters, origin: v })] as const),
            },
            {
              label: "نمایش بر اساس:",
              en: "SORT BY",
              value: sort,
              options: SORT_OPTIONS.map(([v, l]) => [v, l, buildHref(1, { ...filters, sort: v })] as const),
            },
          ]}
        />

        {result.total !== null && (
          <span className="text-xs text-muted">
            <span className="num">{toFaDigits(result.total)}</span> نفر
          </span>
        )}
      </div>

      <div className="mt-8">
        {loadError ? (
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
            اتصال به RankVerse Core Engine برقرار نشد.
            <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
          </div>
        ) : result.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
            هنرمندی با این فیلترها پیدا نشد.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6">
            {result.items.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </div>

      {!loadError && (page > 1 || hasNext) && (
        <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={buildHref(page - 1, filters)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
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
            <Link href={buildHref(page + 1, filters)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
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
