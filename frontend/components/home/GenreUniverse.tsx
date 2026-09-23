"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { GenreCluster } from "@/lib/home-data";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

// Each genre gets its own atmosphere tint, cycled from the brand palette.
const HUES = ["145,99,245", "79,184,166", "232,179,74", "167,139,250", "96,165,250", "244,114,182"];

export default function GenreUniverse({ clusters, sampleSize }: { clusters: GenreCluster[]; sampleSize: number }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = clusters.slice(0, 8);
  if (shown.length < 2) return null;
  const activeIndex = shown.findIndex((c) => c.slug === active);
  const hue = HUES[(activeIndex >= 0 ? activeIndex : 0) % HUES.length];

  return (
    <section className="relative overflow-hidden py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: active ? 1 : 0,
          background: `radial-gradient(ellipse 60% 55% at 50% 60%, rgba(${hue},0.14), transparent 70%)`,
        }}
      />
      <div className="relative mx-auto max-w-7xl px-6">
        <SectionHeading
          kicker="Choose a universe"
          title="یک کهکشان انتخاب کن."
          lead={`ژانرهای ${toFaDigits(sampleSize)} فیلم برتر امروز — هر عدد یعنی چند تا از همین ${toFaDigits(sampleSize)} فیلم در آن ژانرند.`}
        />

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((c, i) => {
            const isActive = active === c.slug;
            const tint = HUES[i % HUES.length];
            return (
              <li key={c.slug}>
                <Link
                  href={`/rankings?genre=${encodeURIComponent(c.slug)}`}
                  onMouseEnter={() => setActive(c.slug)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(c.slug)}
                  onBlur={() => setActive(null)}
                  className="group relative flex h-44 flex-col justify-between overflow-hidden rounded-3xl border border-white/5 bg-surface/30 p-6 transition duration-500 hover:border-white/15"
                  style={isActive ? { boxShadow: `inset 0 0 80px -20px rgba(${tint},0.45)` } : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-3xl text-ink transition group-hover:translate-x-[-2px]">{genreLabel(c.title)}</p>
                      <p className="kicker mt-1 text-muted/60">{c.title}</p>
                    </div>
                    <span className="num text-sm text-muted">
                      {toFaDigits(c.titles.length)}/{toFaDigits(sampleSize)}
                    </span>
                  </div>

                  {/* Member titles surface as small "stars" on hover/focus. */}
                  <div className="flex -space-x-2 space-x-reverse">
                    {c.titles.slice(0, 6).map((t, j) => (
                      <span
                        key={t.id}
                        title={displayTitle(t)}
                        className="relative h-8 w-8 overflow-hidden rounded-full border-2 border-bg bg-surface2 opacity-40 transition duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
                        style={{ transitionDelay: isActive ? `${j * 50}ms` : "0ms" }}
                      >
                        {t.posterUrl && <Image src={t.posterUrl} alt="" fill sizes="32px" className="object-cover" />}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
