import HeroConstellation from "./HeroConstellation";
import { SkyLegend } from "@/components/graph/EgoSky";
import HeroShell from "./HeroShell";
import { HomeTitle } from "@/lib/home-data";
import type { EgoGraph } from "@/lib/api";
import CountUp from "./CountUp";
import type { ReactNode } from "react";

export default function HomeHero({
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
    // overflow-x-clip (not overflow-hidden) so popovers can hang below the hero instead of being cut off.
    <section className="relative overflow-x-clip bg-[#0b0d1c]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(55% 70% at 28% 45%, rgba(40,48,112,0.55), rgba(40,48,112,0) 70%)" }}
      />
      <HeroShell
        text={
          <div className="relative z-10">
            <p dir="ltr" className="text-end text-xs font-medium uppercase tracking-[0.12em] text-teal">Your cinema. Your universe.</p>
            <h1 className="font-display mt-4 text-5xl font-extrabold leading-[1.15] text-ink sm:text-6xl lg:text-7xl">
              سینمای تو.
              <br />
              <span className="text-[#a99bff]">کهکشان تو.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-8 text-[#c4c8e6] sm:text-lg">
              روی هر گره بزن تا مرکز کهکشان شود. امتیاز بده، در نبردها رأی بده و فهرست خودت را بساز.
            </p>
            {stats.length > 0 && (
              <dl className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {stats.map(([label, value, icon]) => (
                  <div
                    key={label}
                    className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md"
                  >
                    <StatIcon name={icon} />
                    <dd className="num mt-2 text-lg font-extrabold text-ink sm:text-xl">
                      <CountUp value={value} />
                    </dd>
                    <dt className="text-[11px] text-[#a3a8cc]">{label}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        }
        graph={
          <>
            <HeroConstellation graphs={graphs} />
            <SkyLegend compact />
          </>
        }
      />
    </section>
  );
}

type StatIconName = "film" | "tv" | "person" | "list" | "battle";

const STAT_ICON_PATHS: Record<StatIconName, ReactNode> = {
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[#5fd8bf]" aria-hidden="true">
      {STAT_ICON_PATHS[name]}
    </svg>
  );
}
