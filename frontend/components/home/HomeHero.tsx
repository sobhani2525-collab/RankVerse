import HeroConstellation from "./HeroConstellation";
import { SkyLegend } from "@/components/graph/EgoSky";
import HeroExploreButton from "./HeroExploreButton";
import { HomeTitle } from "@/lib/home-data";
import type { EgoGraph } from "@/lib/api";
import CountUp from "./CountUp";
import HeroStarfield from "./HeroStarfield";
import Link from "next/link";
import type { ReactNode } from "react";

export default function HomeHero({
  titles,
  graphs,
  movieTotal,
  tvTotal,
  listTotal,
  battleTotal,
  artistTotal,
}: {
  titles: HomeTitle[];
  graphs: EgoGraph[];
  movieTotal: number | null;
  tvTotal: number | null;
  listTotal?: number | null;
  battleTotal?: number | null;
  artistTotal?: number | null;
}) {
  const stats = (
    [
      ["فیلم", movieTotal, "film"],
      ["سریال", tvTotal, "tv"],
      ["هنرمند", artistTotal, "person"],
      ["فهرست", listTotal, "list"],
      ["نبرد", battleTotal, "battle"],
    ] as [string, number | null | undefined, StatIconName][]
  ).filter((s): s is [string, number, StatIconName] => typeof s[1] === "number");
  return (
    // overflow-x-clip (not overflow-hidden) so the search dropdown can hang
    // below the hero instead of being cut off.
    <section className="relative overflow-x-clip border-b border-border/60 bg-[#070A12]">
      {/* Atmosphere: drifting stars and faint nebulae, no data meaning. */}
      <HeroStarfield />

      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-6 pb-10 pt-14 lg:min-h-[640px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:py-16">
        <div className="relative z-10">
          <p className="kicker text-teal/80">Your cinema. Your universe.</p>
          <div className="mt-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/[0.08] px-3 py-1 text-xs text-teal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                <path d="M3 12a9 3 0 0 0 18 0" />
              </svg>
              متصل به پایگاه دادهٔ TMDb
            </span>
          </div>
          <h1 className="font-display mt-4 text-5xl leading-[1.15] text-ink sm:text-6xl lg:text-7xl">
            سینمای تو.
            <br />
            <span className="gradient-text">کهکشان تو.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-8 text-muted sm:text-lg">
            روی <strong className="font-semibold text-teal">نقشهٔ کهکشانی</strong> سینما بگرد و ببین فیلم‌ها، سریال‌ها، هنرمندان و
            ژانرها چطور به هم وصل‌اند. <strong className="font-semibold text-teal">امتیاز بده</strong>، در نبردها رأی بده، فهرست خودت
            را بساز و <strong className="font-semibold text-teal">پیشنهادهایی</strong> بگیر که به سلیقه‌ات می‌خورد.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <HeroExploreButton className="btn-primary btn-glow text-sm" />
            <Link
              href="#battle-arena"
              className="inline-flex items-center gap-2 rounded-xl border border-violet-soft/40 px-5 py-3 text-sm font-semibold text-ink transition hover:border-violet-soft hover:bg-violet/10"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
                <path d="m13 19 6-6" />
                <path d="m16 16 4 4" />
                <path d="m19 21 2-2" />
              </svg>
              همین حالا نبرد کن
            </Link>
          </div>

          {stats.length > 0 && (
            <dl className="mt-10 grid grid-cols-3 gap-y-2 rounded-2xl border border-white/10 bg-[#0A0F18]/55 py-2 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md sm:grid-cols-5 sm:divide-x sm:divide-x-reverse sm:divide-white/10">
              {stats.map(([label, value, icon]) => (
                <div key={label} className="flex flex-col items-center px-2 py-2 text-center">
                  <StatIcon name={icon} />
                  <dt className="order-last mt-0.5 text-xs text-muted">{label}</dt>
                  <dd className="num mt-2 text-xl text-ink sm:text-2xl">
                    <CountUp value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-[560px]">
          <HeroConstellation graphs={graphs} />
          <SkyLegend />
        </div>
      </div>
    </section>
  );
}

type StatIconName = "film" | "tv" | "person" | "list" | "battle";

const STAT_ICON_PATHS: Record<StatIconName, ReactNode> = {
  // Clapperboard
  film: (
    <>
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3.4 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </>
  ),
  tv: (
    <>
      <rect width="20" height="15" x="2" y="7" rx="2" />
      <path d="m17 2-5 5-5-5" />
    </>
  ),
  person: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  // Crossed swords
  battle: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="m5 14 4 4" />
      <path d="m7 17-3 3" />
      <path d="m3 19 2 2" />
    </>
  ),
};

function StatIcon({ name }: { name: StatIconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-teal/90" aria-hidden="true">
      {STAT_ICON_PATHS[name]}
    </svg>
  );
}
