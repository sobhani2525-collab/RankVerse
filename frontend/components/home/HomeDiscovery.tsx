import Link from "next/link";
import { Suspense } from "react";
import SearchBox from "@/components/SearchBox";
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
    <section className="relative z-30 bg-[#0b0d1c]">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-8">
        <div className="grid gap-5 rounded-3xl border border-border bg-surface bg-[radial-gradient(ellipse_at_top_right,#a99bff24,transparent_58%)] p-4 sm:p-6 lg:gap-6 lg:p-8">
          <div className="relative z-10 min-w-0 rounded-2xl bg-[#0b0c22] bg-[length:100%_100%,100%_auto] bg-left-top bg-no-repeat bg-[image:linear-gradient(to_bottom,transparent_15%,#0b0c22_56%),url('/cinema-galaxy-mobile.webp')] px-4 pb-4 pt-36 sm:px-6 lg:flex lg:min-h-[300px] lg:flex-col lg:justify-center lg:bg-[image:url('/cinema-galaxy.webp')] lg:bg-cover lg:bg-left lg:py-6 lg:ps-8">
            <div className="lg:w-1/2">
              <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">فیلم بعدی‌ات را پیدا کن</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <SearchBox scope="screen" className="min-w-0 flex-[1_1_12rem]" />
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
          </div>
          <div id="tonight" className="min-w-0 scroll-mt-24 rounded-2xl border border-border bg-bg/60 p-3 sm:p-4">
            <h2 className="font-display text-2xl leading-tight text-ink">پیشنهاد برای امشب</h2>
            <Suspense fallback={<p className="mt-2 text-sm text-muted" role="status">در حال دریافت پیشنهادها…</p>}>
              <TonightRecommendations />
            </Suspense>
          </div>
        </div>
      </div>
    </section>
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
