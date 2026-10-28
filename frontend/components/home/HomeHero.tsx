import HeroConstellation from "./HeroConstellation";
import { SkyLegend } from "@/components/graph/EgoSky";
import HeroShell from "./HeroShell";
import { HomeTitle } from "@/lib/home-data";
import type { EgoGraph } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";

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
      ["فیلم", movieTotal],
      ["سریال", tvTotal],
      ["هنرمند", artistTotal],
      ["فهرست", listTotal],
      ["نبرد", battleTotal],
    ] as [string, number | null | undefined][]
  ).filter((s): s is [string, number] => typeof s[1] === "number");
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
              <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#a3a8cc]">
                {stats.map(([label, value]) => (
                  <div key={label} className="flex gap-1">
                    <dd className="num">{toFaDigits(value.toLocaleString("en-US")).replace(/,/g, "٬")}</dd>
                    <dt>{label}</dt>
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
