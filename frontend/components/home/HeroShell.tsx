"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { GRAPH_SECTION_ID } from "@/lib/graph-focus";

const FullscreenContext = createContext<{ fullscreen: boolean; toggle: () => void }>({ fullscreen: false, toggle: () => {} });

export const useHeroFullscreen = () => useContext(FullscreenContext);

/** Lays out the hero's text beside the graph; full screen drops the text and lets the graph take the whole width. */
export default function HeroShell({ text, graph }: { text: ReactNode; graph: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <FullscreenContext.Provider value={{ fullscreen, toggle: () => setFullscreen((v) => !v) }}>
      <div
        id={GRAPH_SECTION_ID}
        className={
          fullscreen
            ? "relative mx-auto max-w-7xl px-6 pb-10 pt-10"
            : "relative mx-auto grid max-w-7xl items-center gap-6 px-6 pb-10 pt-14 lg:min-h-[640px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:py-16"
        }
      >
        {!fullscreen && text}
        <div className={fullscreen ? "relative mx-auto w-full max-w-[860px]" : "relative mx-auto w-full max-w-[560px]"}>{graph}</div>
      </div>
    </FullscreenContext.Provider>
  );
}
