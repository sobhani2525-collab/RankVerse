"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { GRAPH_SECTION_ID } from "@/lib/graph-focus";
import type { EgoNode } from "@/lib/api";
import { nameOf, TYPE_LABEL } from "@/components/graph/EgoSky";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";

const FullscreenContext = createContext<{ fullscreen: boolean; toggle: () => void; setCenter: (n: EgoNode | null) => void }>({
  fullscreen: false,
  toggle: () => {},
  setCenter: () => {},
});

export const useHeroFullscreen = () => useContext(FullscreenContext);

/** Lays out the hero's text beside the graph; full screen drops the text and lets the graph take the whole width. */
export default function HeroShell({ text, graph }: { text: ReactNode; graph: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [center, setCenter] = useState<EgoNode | null>(null);
  return (
    <FullscreenContext.Provider value={{ fullscreen, toggle: () => setFullscreen((v) => !v), setCenter }}>
      <div
        id={GRAPH_SECTION_ID}
        className={
          fullscreen
            ? "relative mx-auto max-w-7xl px-6 pb-10 pt-10"
            : "relative mx-auto grid max-w-7xl items-center gap-6 px-6 pb-10 pt-14 lg:min-h-[640px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:py-16"
        }
      >
        {!fullscreen && (
          <div className="relative z-10 flex flex-col gap-8">
            {text}
            <CenterCard center={center} className="hidden lg:flex" />
          </div>
        )}
        <div className={fullscreen ? "relative mx-auto w-full max-w-[860px]" : "relative mx-auto w-full max-w-[560px]"}>
          {graph}
          <CenterCard center={center} className="mt-4 flex lg:hidden" />
        </div>
      </div>
    </FullscreenContext.Provider>
  );
}

/** «مرکز کهکشان»: the poster, name and actions of whatever sits at the graph's centre. */
function CenterCard({ center, className = "" }: { center: EgoNode | null; className?: string }) {
  if (!center) return null;
  const href = detailPathFor(center.entity_type, center.slug);
  return (
    <div className={`items-center gap-4 rounded-3xl border border-[#2a2f5c] bg-[#141733] p-4 ${className}`}>
      <div className="relative h-[120px] w-[84px] shrink-0 overflow-hidden rounded-2xl bg-[#101330]">
        {center.image_url && <Image src={center.image_url} alt="" fill sizes="84px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[#a3a8cc]">مرکز کهکشان</p>
        <p className="mt-1 truncate text-xl font-extrabold text-[#f5b94a]">{nameOf(center)}</p>
        <p className="text-xs text-[#a3a8cc]">
          {TYPE_LABEL[center.entity_type]}
          {center.year ? ` · ${toFaDigits(center.year)}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {href && (
            <Link href={href} className="inline-flex min-h-11 items-center rounded-xl bg-[#a99bff]/20 px-4 text-sm font-bold text-[#c9c0ff] hover:bg-[#a99bff]/30">
              ★ امتیاز بده
            </Link>
          )}
          <Link href="/battles/new" className="inline-flex min-h-11 items-center rounded-xl bg-[#1d2147] px-4 text-sm font-bold text-ink hover:bg-[#262b5c]">
            نبرد بساز
          </Link>
        </div>
      </div>
    </div>
  );
}
