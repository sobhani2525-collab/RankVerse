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
      کاوش در کهکشان
    </a>
  );
}
