/**
 * Lets any part of the home page ask the knowledge-graph explorer
 * (components/home/KnowledgeGraphExplorer.tsx) to re-centre on an entity.
 * The two live in separate sections of a server-rendered page, so a window
 * event keeps them decoupled without wrapping the page in a new provider.
 */

export const GRAPH_FOCUS_EVENT = "rankverse:graph-focus";

// The entity types the explorer knows how to expand (see its loadFocus).
export type GraphFocusKind = "movie" | "tv_series" | "person" | "genre";
export const GRAPH_FOCUS_KINDS: ReadonlySet<string> = new Set<GraphFocusKind>(["movie", "tv_series", "person", "genre"]);

export interface GraphFocusRequest {
  kind: GraphFocusKind;
  slug: string;
  // Start the explorer's path over from this entity instead of extending it.
  reset?: boolean;
}

export const GRAPH_SECTION_ID = "universe";
// The graph canvas itself; scrolling to this (centred) instead of the
// section top keeps the heading from eating the viewport.
export const GRAPH_CANVAS_ID = "universe-graph";

export function scrollToGraph(opts: { onlyIfHidden?: boolean } = {}): void {
  const target = document.getElementById(GRAPH_CANVAS_ID) ?? document.getElementById(GRAPH_SECTION_ID);
  if (!target) return;
  if (opts.onlyIfHidden) {
    // Already fully on screen: just let the content change, don't jump.
    const r = target.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
}

export function requestGraphFocus(request: GraphFocusRequest): void {
  window.dispatchEvent(new CustomEvent<GraphFocusRequest>(GRAPH_FOCUS_EVENT, { detail: request }));
}

// The entity the home hero currently shows at its centre. The hero picks it
// at random in the browser; "کاوش در کهکشان" reads it so the explorer opens
// on what the visitor just saw, not on a different entity.
let heroCenter: GraphFocusRequest | null = null;

export function setHeroCenter(center: GraphFocusRequest | null): void {
  heroCenter = center;
}

export function getHeroCenter(): GraphFocusRequest | null {
  return heroCenter;
}
