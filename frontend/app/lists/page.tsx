import type { Metadata } from "next";
import { SITE_LOCALE, SITE_NAME } from "@/lib/site";
import Link from "next/link";
import ConstellationListCard from "@/components/lists/constellation-list-card";
import FeaturedList from "@/components/lists/featured-list";
import { MonoLabel } from "@/components/list-detail/ui";
import { discoverLists } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { rethrowOutsideBuild } from "@/lib/isr";
import type { ListSummary } from "@/lib/types";

export const revalidate = 600;
const TITLE = "لیست‌های کاربران — بهترین فیلم‌ها و سریال‌ها";
const DESCRIPTION =
  "لیست‌های ساخته‌ی کاربران سینماگزین: بهترین فیلم‌ها و سریال‌ها به انتخاب علاقه‌مندان سینما، از کلاسیک‌ها تا تازه‌ترین‌ها.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/lists" },
  openGraph: {
    type: "website",
    url: "/lists",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    title: TITLE,
    description: DESCRIPTION,
    images: ["/logo.png"],
  },
};

const PAGE_SIZE = 12;

const SORTS = [
  ["newest", "تازه‌ترین"],
  ["popular", "محبوب‌ترین"],
] as const;

const TYPES = [
  ["all", "همه"],
  ["movie", "فیلم"],
  ["tv_series", "سریال"],
] as const;

interface Filters {
  sort: "newest" | "popular";
  type: string;
  tag?: string;
  page: number;
}

function buildHref(f: Filters): string {
  const qs = new URLSearchParams();
  if (f.sort !== "newest") qs.set("sort", f.sort);
  if (f.type !== "all") qs.set("type", f.type);
  if (f.tag) qs.set("tag", f.tag);
  if (f.page > 1) qs.set("page", String(f.page));
  const s = qs.toString();
  return s ? `/lists?${s}` : "/lists";
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex min-h-[40px] items-center rounded-full border px-4 text-sm transition ${
        active
          ? "border-gold/60 bg-gold/10 font-bold text-gold"
          : "border-border text-muted hover:border-teal/40 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

/** Hero backdrop: a drifting constellation drawn from the same violet/teal edges as the list page. */
function HeroSky() {
  const nodes: [number, number, number][] = [
    [40, 150, 5], [120, 90, 7], [210, 120, 5], [290, 50, 9], [360, 110, 5], [110, 190, 4], [250, 190, 4],
  ];
  const edges: [number, number, string][] = [
    [0, 1, "#A99BFF"], [1, 2, "#4FB8A6"], [2, 3, "#A99BFF"], [3, 4, "#4FB8A6"], [1, 5, "#4FB8A6"], [2, 6, "#A99BFF"],
  ];
  return (
    <svg
      className="rv-drift pointer-events-none absolute -left-6 top-0 hidden h-full w-[420px] opacity-80 md:block"
      viewBox="0 0 420 240"
      aria-hidden="true"
    >
      {edges.map(([a, b, c], i) => (
        <line
          key={i}
          x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
          stroke={c} strokeOpacity="0.55" pathLength={1}
          className="rv-draw" style={{ ["--rv-delay" as string]: `${i * 0.2}s` }}
        />
      ))}
      {nodes.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r * 2.6} fill={i === 3 ? "#E8B34A" : "#9163f5"} className="rv-halo" style={{ ["--rv-delay" as string]: `${i * 0.7}s` }} />
          <circle cx={x} cy={y} r={r} fill={i === 3 ? "#E8B34A" : "#F2F0E8"} />
        </g>
      ))}
    </svg>
  );
}

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; type?: string; tag?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filters: Filters = {
    sort: params.sort === "popular" ? "popular" : "newest",
    type: TYPES.some(([v]) => v === params.type) ? params.type! : "all",
    tag: params.tag?.trim() || undefined,
    page: Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1),
  };
  const unfiltered = filters.type === "all" && !filters.tag && filters.page === 1;

  let lists: ListSummary[] = [];
  let featured: ListSummary | null = null;
  let loadError: string | null = null;

  try {
    // One extra row tells us whether a next page exists.
    lists = await discoverLists({
      page: filters.page,
      page_size: PAGE_SIZE + 1,
      sort: filters.sort,
      entity_type: filters.type === "all" ? undefined : filters.type,
      tag: filters.tag,
    });
    if (unfiltered && filters.sort === "newest") {
      const [top] = await discoverLists({ page_size: 1, sort: "popular" }).catch(() => []);
      if (top && top.preview_items.length > 0) featured = top;
    }
  } catch (err) {
    rethrowOutsideBuild(err);
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  const hasNext = lists.length > PAGE_SIZE;
  const visible = lists.slice(0, PAGE_SIZE).filter((l) => l.id !== featured?.id);
  const tags = Array.from(new Set(lists.flatMap((l) => l.tags))).slice(0, 10);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
      <header className="relative mb-10 overflow-hidden rounded-3xl border border-border-soft bg-surface/50 px-6 py-10 md:px-12 md:py-14">
        <HeroSky />
        <div className="relative flex max-w-xl flex-col items-start gap-4">
          <MonoLabel className="text-teal/80">CONSTELLATIONS</MonoLabel>
          <h1 className="font-display text-4xl leading-tight text-ink md:text-5xl">
            صورت‌های فلکیِ <span className="gradient-text">سلیقه</span>
          </h1>
          <p className="text-sm leading-[2] text-ink-dim md:text-base">
            هر لیست، مسیری از ستاره‌هاست؛ فیلم‌ها و آدم‌هایی که یک نفر با یک خط به هم وصل کرده.
            یکی را دنبال کن، یا خودت آسمانت را بساز.
          </p>
          <Link href="/lists/new" className="btn-primary mt-1 text-sm hover:opacity-90">
            ساخت لیست جدید
          </Link>
        </div>
      </header>

      <nav aria-label="فیلتر لیست‌ها" className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MonoLabel size="text-[10px]" className="ml-1 text-dim">SORT</MonoLabel>
            {SORTS.map(([v, label]) => (
              <Pill key={v} href={buildHref({ ...filters, sort: v, page: 1 })} active={filters.sort === v}>
                {label}
              </Pill>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MonoLabel size="text-[10px]" className="ml-1 text-dim">TYPE</MonoLabel>
            {TYPES.map(([v, label]) => (
              <Pill key={v} href={buildHref({ ...filters, type: v, page: 1 })} active={filters.type === v}>
                {label}
              </Pill>
            ))}
          </div>
        </div>
        {(tags.length > 0 || filters.tag) && (
          <div className="flex flex-wrap items-center gap-2">
            <MonoLabel size="text-[10px]" className="ml-1 text-dim">TAGS</MonoLabel>
            {filters.tag && (
              <Pill href={buildHref({ ...filters, tag: undefined, page: 1 })} active>
                #{filters.tag} ✕
              </Pill>
            )}
            {tags
              .filter((t) => t !== filters.tag)
              .map((t) => (
                <Pill key={t} href={buildHref({ ...filters, tag: t, page: 1 })} active={false}>
                  #{t}
                </Pill>
              ))}
          </div>
        )}
      </nav>

      {loadError ? (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
          اتصال به RankVerse Core Engine برقرار نشد.
          <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
        </div>
      ) : visible.length === 0 && !featured ? (
        <div className="rounded-2xl border border-border bg-surface/60 px-6 py-14 text-center text-muted">
          {filters.tag || filters.type !== "all"
            ? "لیستی با این فیلتر پیدا نشد."
            : "هنوز لیستی ساخته نشده. اولین نفر باشید!"}
        </div>
      ) : (
        <>
          {featured && <FeaturedList list={featured} />}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {visible.map((list, i) => (
              <ConstellationListCard key={list.id} list={list} delay={(i % 6) * 60} />
            ))}
          </div>
          {(filters.page > 1 || hasNext) && (
            <div className="mt-10 flex items-center justify-center gap-3">
              {filters.page > 1 && (
                <Pill href={buildHref({ ...filters, page: filters.page - 1 })} active={false}>
                  صفحه قبل
                </Pill>
              )}
              <span className="num text-sm text-muted">{toFaDigits(filters.page)}</span>
              {hasNext && (
                <Pill href={buildHref({ ...filters, page: filters.page + 1 })} active={false}>
                  صفحه بعد
                </Pill>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
