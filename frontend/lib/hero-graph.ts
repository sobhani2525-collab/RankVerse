import type { EgoGraph, EgoNode } from "@/lib/api";
import { detailPathFor } from "@/lib/entity-routes";

export type NodeAction = { type: "recenter"; slug: string } | { type: "navigate"; href: string } | { type: "none" };

/** Any star but the current centre (film, series, artist or genre) becomes the new centre. */
export function actionForNode(node: EgoNode, centerId: string): NodeAction {
  if (node.id === centerId) return { type: "none" };
  if (node.entity_type === "movie" || node.entity_type === "tv_series" || node.entity_type === "person" || node.entity_type === "genre") return { type: "recenter", slug: node.slug };
  const href = detailPathFor(node.entity_type, node.slug);
  return href ? { type: "navigate", href } : { type: "none" };
}

export function centerNodeOf(graph: EgoGraph | null): EgoNode | null {
  return graph?.nodes.find((n) => n.id === graph.center_id) ?? null;
}

/** A re-centred graph's own centre carries no credits; keep the ones the clicked star had so its card can name the role. */
export function keepCredits(graph: EgoGraph, clicked: EgoNode): EgoGraph {
  if (!clicked.credits?.length) return graph;
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === graph.center_id && !n.credits?.length ? { ...n, credits: clicked.credits } : n)) };
}
