"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { GRAPH_SECTION_ID } from "@/lib/graph-focus";
import type { EgoNode } from "@/lib/api";
import { nameOf, roleOf, TYPE_LABEL } from "@/components/graph/EgoSky";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";

const FullscreenContext = createContext<{ fullscreen: boolean; toggle: () => void }>({
  fullscreen: false,
  toggle: () => {},
});

export const useHeroFullscreen = () => useContext(FullscreenContext);

/** Lays out the hero's text beside the graph; full screen drops the text and lets the graph take the whole width. */
export default function HeroShell({ text, graph, center }: { text: ReactNode; graph: ReactNode; center: EgoNode | null }) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <FullscreenContext.Provider value={{ fullscreen, toggle: () => setFullscreen((v) => !v) }}>
      <div
        id={GRAPH_SECTION_ID}
        className={
          fullscreen
            ? "relative mx-auto max-w-7xl px-6 pb-10 pt-10"
            : "relative mx-auto grid max-w-7xl items-center gap-4 px-4 pb-6 pt-8 sm:gap-6 sm:px-6 sm:pb-10 sm:pt-12 lg:min-h-[640px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:py-16"
        }
      >
        {!fullscreen && (
          <div className="relative z-10 flex flex-col gap-8">
            {text}
            <CenterCard center={center} className="hidden lg:flex" hideBattle />
          </div>
        )}
        <div className={fullscreen ? "relative mx-auto w-full max-w-[860px]" : "relative mx-auto w-full max-w-[560px]"}>
          {graph}
          <CenterCard center={center} className="mt-4 flex lg:hidden" hideBattle />
        </div>
      </div>
    </FullscreenContext.Provider>
  );
}

/** «مرکز کهکشان»: the poster, name and actions of whatever sits at the graph's centre. */
export function CenterCard({ center, className = "", hideBattle = false }: {
  center: EgoNode | null;
  className?: string;
  hideBattle?: boolean;
}) {
  if (!center) return null;
  const href = detailPathFor(center.entity_type, center.slug);
  const ratingHref = center.entity_type === "movie" || center.entity_type === "tv_series" ? href : null;
  return (
    <div className={`flex-col gap-3 ${className}`}>
    <div className="flex items-center gap-4 rounded-3xl border border-[#2a2f5c] bg-[#141733] p-4">
      {href ? (
        <Link href={href} aria-label={nameOf(center)} className="shrink-0 focus-visible:outline-gold">
                <div className="relative h-[120px] w-[84px] shrink-0 overflow-hidden rounded-2xl bg-[#101330]">
        {center.image_url && <Image src={center.image_url} alt="" fill sizes="84px" className="object-cover" />}
      </div>
        </Link>
      ) : (
              <div className="relative h-[120px] w-[84px] shrink-0 overflow-hidden rounded-2xl bg-[#101330]">
        {center.image_url && <Image src={center.image_url} alt="" fill sizes="84px" className="object-cover" />}
      </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[#a3a8cc]">مرکز کهکشان</p>
        <p className="mt-1 truncate text-xl font-extrabold text-[#f5b94a]">
          {href ? <Link href={href} className="hover:underline focus-visible:outline-gold">{nameOf(center)}</Link> : nameOf(center)}
        </p>
        <p className="text-xs text-[#a3a8cc]">
          {roleOf(center) ?? TYPE_LABEL[center.entity_type]}
          {center.year ? ` · ${toFaDigits(center.year)}` : ""}
        </p>
        {(ratingHref || !hideBattle) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ratingHref && (
              <Link href={ratingHref} className="inline-flex min-h-11 items-center rounded-xl bg-[#a99bff]/20 px-4 text-sm font-bold text-[#c9c0ff] hover:bg-[#a99bff]/30">
                ★ امتیاز بده
              </Link>
            )}
            {!hideBattle && (
              <Link href="/battles/new" className="inline-flex min-h-11 items-center rounded-xl bg-[#1d2147] px-4 text-sm font-bold text-ink hover:bg-[#262b5c]">
                نبرد بساز
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
