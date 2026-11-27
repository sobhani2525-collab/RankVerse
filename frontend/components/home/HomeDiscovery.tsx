import Link from "next/link";
import { Suspense } from "react";
import SearchBox from "@/components/SearchBox";
import { GRAPH_SECTION_ID } from "@/lib/graph-focus";
import { getRankingsPage } from "@/lib/api";
import TonightChoices from "./TonightChoices";

const shortcuts = [
  ["زیر ۹۰ دقیقه", "/rankings?runtime_under=90"],
  ["ژانر خانوادگی", "/rankings?genre=family"],
  ["فیلم‌های معمایی", "/rankings?genre=mystery"],
  ["سریال‌ها", "/rankings?type=tv_series"],
] as const;

export default function HomeDiscovery() {
  return (
    <div className="relative z-30 bg-[#0b0d1c]">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-8">
        <section aria-labelledby="home-discovery-title" className="relative isolate grid gap-5 rounded-3xl border border-violet-light/25 bg-[#101329] px-3 py-4 sm:gap-6 sm:p-7 lg:gap-7 lg:p-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-left-top bg-no-repeat bg-[length:100%_100%,auto_98%] bg-[image:linear-gradient(110deg,rgba(16,19,41,0.18),rgba(16,19,41,0.84)_70%),url('/cinema-galaxy.png')] max-sm:blur-[4px] max-sm:[clip-path:inset(0_round_1.5rem)] lg:bg-[length:100%_100%,98%_auto]" />
          <div className="relative z-10 min-w-0">
            <h1 id="home-discovery-title" className="text-balance font-display text-2xl leading-tight text-ink sm:text-4xl">فیلم بعدی‌ات را همین‌جا پیدا کن</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim sm:text-base">جستجو در میان هزاران فیلم و سریال، یا شروع از پیشنهادهای ویژه.</p>
            <div className="mt-5 flex flex-col gap-2 sm:max-w-2xl sm:flex-row">
              <SearchBox scope="screen" className="min-w-0 sm:flex-[1_1_14rem]" />
              <Link href="#tonight" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-l from-violet-light to-teal px-4 text-sm font-extrabold text-bg hover:brightness-110 focus-visible:outline-gold">
                امشب چی ببینم؟
              </Link>
            </div>
            <nav aria-label="انتخاب سریع" className="mt-3 flex flex-wrap gap-2">
              {shortcuts.map(([label, href]) => (
                <Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface2/70 px-3 text-sm text-ink-dim transition hover:border-violet-light/50 hover:text-ink focus-visible:outline-gold">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div id="tonight" className="min-w-0 scroll-mt-24 border-t border-violet-light/25 pt-3 sm:rounded-2xl sm:border sm:bg-[#0c1022]/50 sm:p-5 sm:backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <h2 className="font-display text-2xl leading-tight text-ink">پیشنهاد برای امشب</h2>
              <Link href={`#${GRAPH_SECTION_ID}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-teal hover:underline focus-visible:outline-gold">
                <span aria-hidden="true">✦</span>
                کشف فیلم‌های مرتبط
                <span aria-hidden="true">↓</span>
              </Link>
            </div>
            <Suspense fallback={<p className="mt-2 text-sm text-muted" role="status">در حال دریافت پیشنهادها…</p>}>
              <TonightRecommendations />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}

async function TonightRecommendations() {
  const themes = [
    { label: "وقت کم دارم", reason: "فیلمی برای وقتی که کمتر از ۹۰ دقیقه وقت داری.", filters: { runtime_under: 90 } },
    { label: "فیلم خانوادگی", reason: "انتخابی از ژانر خانوادگی برای تماشای جمعی.", filters: { genre: "family" } },
    { label: "معمای درگیرکننده", reason: "انتخابی از ژانر معمایی برای دنبال‌کردن سرنخ‌ها.", filters: { genre: "mystery" } },
  ];
  const groups = await Promise.all(themes.map(async ({ label, reason, filters }) => {
    const movies = await getRankingsPage("movie", { ...filters, page_size: 9 })
      .then((page) => page.items, () => []);
    return movies.map((movie) => ({
      id: movie.id,
      title: movie.title,
      title_fa: movie.title_fa,
      href: `/movies/${movie.slug}`,
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w185${movie.poster_path}` : movie.media?.image_url,
      year: movie.year,
      runtime: movie.runtime,
      label,
      reason,
    }));
  }));
  return <TonightChoices fallback={[]} groups={groups} />;
}
