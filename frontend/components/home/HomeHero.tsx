import Link from "next/link";
import HeroConstellation from "./HeroConstellation";
import HeroGraphSearch from "./HeroGraphSearch";
import { HomeTitle } from "@/lib/home-data";
import { toFaDigits } from "@/lib/format-number";

export default function HomeHero({
  titles,
  movieTotal,
  tvTotal,
}: {
  titles: HomeTitle[];
  movieTotal: number | null;
  tvTotal: number | null;
}) {
  return (
    // overflow-x-clip (not overflow-hidden) so the search dropdown can hang
    // below the hero instead of being cut off.
    <section className="relative overflow-x-clip border-b border-border/60 bg-[#070A12]">
      {/* Atmosphere: two faint nebulae, no data meaning. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 22% 50%, rgba(145,99,245,0.16), transparent 70%), radial-gradient(ellipse 40% 45% at 85% 20%, rgba(79,184,166,0.08), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-6 pb-10 pt-14 lg:min-h-[640px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:py-16">
        <div className="relative z-10">
          <p className="kicker text-teal/80">Your cinema. Your universe.</p>
          <h1 className="font-display mt-5 text-5xl leading-[1.15] text-ink sm:text-6xl lg:text-7xl">
            سینمای تو.
            <br />
            <span className="gradient-text">کهکشان تو.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-8 text-muted sm:text-lg">
            فیلم‌ها فقط یک رتبه نیستند؛
            <br />
            جهان‌هایی‌اند که به هم وصل‌اند.
          </p>

          <HeroGraphSearch />

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="#universe" className="btn-primary text-sm hover:opacity-90">
              کاوش در کهکشان
            </Link>
            <Link href="/rankings" className="btn-secondary text-sm transition hover:border-gold/40 hover:text-gold">
              دیدن رتبه‌بندی
            </Link>
          </div>

          {(movieTotal !== null || tvTotal !== null) && (
            <dl className="mt-10 flex gap-8 text-sm">
              {movieTotal !== null && (
                <div>
                  <dt className="kicker text-muted/70">Films</dt>
                  <dd className="num mt-1 text-2xl text-ink">{toFaDigits(movieTotal)}</dd>
                </div>
              )}
              {tvTotal !== null && (
                <div>
                  <dt className="kicker text-muted/70">Series</dt>
                  <dd className="num mt-1 text-2xl text-ink">{toFaDigits(tvTotal)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {titles.length > 0 && (
          <div className="relative mx-auto w-full max-w-[560px]">
            <HeroConstellation titles={titles} />
            <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted/80">
              <span>هر ستاره یک فیلم برتر · اندازه = امتیاز</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-px w-4 bg-gold" /> کارگردان مشترک
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-px w-4 bg-teal" /> ژانر مشترک
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
