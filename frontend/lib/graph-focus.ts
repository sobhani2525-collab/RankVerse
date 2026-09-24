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
}

export const GRAPH_SECTION_ID = "universe";

export function requestGraphFocus(request: GraphFocusRequest): void {
  window.dispatchEvent(new CustomEvent<GraphFocusRequest>(GRAPH_FOCUS_EVENT, { detail: request }));
}
