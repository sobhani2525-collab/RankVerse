import Link from "next/link";
import { Suspense } from "react";
import SearchBox from "@/components/SearchBox";
import { GRAPH_SECTION_ID } from "@/lib/graph-focus";
import { getRankingsPage } from "@/lib/api";
import HeroStarfield from "./HeroStarfield";
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
        <section aria-labelledby="home-discovery-title" className="relative isolate grid gap-6 rounded-3xl border border-violet-light/25 bg-[#101329] p-4 sm:p-7 lg:gap-7 lg:p-9">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit] bg-[radial-gradient(ellipse_at_18%_22%,#342667_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,#12313c,transparent_55%)]">
            <HeroStarfield />
            <div className="absolute -left-20 -top-8 h-52 w-[420px] -rotate-[24deg] rounded-[50%] border border-violet-light/25 sm:left-0">
              <div className="absolute inset-5 rounded-[inherit] border border-teal/20" />
              <div className="absolute inset-10 rounded-[inherit] border border-dashed border-violet-light/20" />
              <span className="absolute bottom-2 left-[28%] size-2.5 rounded-full bg-gold shadow-[0_0_24px_5px_#ffbc57]" />
              <span className="absolute right-[13%] top-[12%] size-2 rounded-full bg-teal shadow-[0_0_20px_4px_#4fb8a6]" />
            </div>
          </div>
          <div className="relative z-10 min-w-0">
            <h1 id="home-discovery-title" className="font-display text-3xl leading-tight text-ink sm:text-5xl">فیلم بعدی‌ات را پیدا کن</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim sm:text-base">اسم یک فیلم یا سریال را جست‌وجو کن، یا از پیشنهادهای امشب شروع کن.</p>
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
          <div id="tonight" className="min-w-0 scroll-mt-24 rounded-2xl border border-violet-light/20 bg-[#0c1022]/90 p-3 sm:p-5">
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
