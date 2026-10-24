"use client";

import { GRAPH_FOCUS_KINDS, GRAPH_SECTION_ID, getHeroCenter, requestGraphFocus, scrollToGraph } from "@/lib/graph-focus";

export default function HeroExploreButton({ className }: { className?: string }) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const section = document.getElementById(GRAPH_SECTION_ID);
    if (!section) return; // explorer not on the page: leave the plain anchor jump
    e.preventDefault();
    const center = getHeroCenter();
    if (center && GRAPH_FOCUS_KINDS.has(center.kind)) requestGraphFocus(center);
    scrollToGraph();
  }

  return (
    <a href={`#${GRAPH_SECTION_ID}`} onClick={onClick} className={className}>
      {/* Telescope */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m10.07 11.88 4.49-1.2" />
        <path d="M18.38 3.26 6.14 6.54a1 1 0 0 0-.7 1.23l1.3 4.84a1 1 0 0 0 1.22.7l12.24-3.28" />
        <path d="m19.19 2.17 1.73 6.46" />
        <path d="m4.11 7.72-1.93.52.78 2.9 1.93-.52" />
        <path d="m13 13 3 8" />
        <path d="M11 13l-3 8" />
        <circle cx="12" cy="13" r="2" />
      </svg>
      کاوش در کهکشان
    </a>
  );
}
