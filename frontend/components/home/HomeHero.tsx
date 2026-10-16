import HeroConstellation from "./HeroConstellation";
import HeroExploreButton from "./HeroExploreButton";
import { HomeTitle } from "@/lib/home-data";
import type { EgoGraph } from "@/lib/api";
import CountUp from "./CountUp";

export default function HomeHero({
  titles,
  graphs,
  movieTotal,
  tvTotal,
  listTotal,
  artistTotal,
}: {
  titles: HomeTitle[];
  graphs: EgoGraph[];
  movieTotal: number | null;
  tvTotal: number | null;
  listTotal?: number | null;
  artistTotal?: number | null;
}) {
  const stats = (
    [
      ["فیلم", movieTotal],
      ["سریال", tvTotal],
      ["فهرست", listTotal],
      ["هنرمند", artistTotal],
    ] as [string, number | null | undefined][]
  ).filter((s): s is [string, number] => typeof s[1] === "number");
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
            در کهکشان سینما بگرد، فیلم و سریال‌ها را درو کن و فهرست خودت را بساز؛ قطعا از رابطه بین آنها شگفت‌زده خواهی شد.
          </p>


          <div className="mt-6 flex flex-wrap gap-3">
            <HeroExploreButton className="btn-primary text-sm hover:opacity-90" />
          </div>

          {stats.length > 0 && (
            <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 text-sm">
              {stats.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted/70">{label}</dt>
                  <dd className="num mt-1 text-2xl text-ink">
                    <CountUp value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {true && (
          <div className="relative mx-auto w-full max-w-[560px]">
            <HeroConstellation graphs={graphs} />
            <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted/80">
              <span className="w-full text-center">مرکز هر بار تصادفی است؛ خط بین دو ستاره یعنی با هم ارتباط دارند</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-violet" /> فیلم / سریال
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-teal" /> هنرمند
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full border border-teal" /> ژانر
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-px w-4 bg-gold" /> نقش در اثر
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
