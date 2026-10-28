import type { EgoGraph, EgoNode } from "@/lib/api";
import { detailPathFor } from "@/lib/entity-routes";

export type NodeAction = { type: "recenter"; slug: string } | { type: "navigate"; href: string } | { type: "none" };

/** A film/series star becomes the new centre; artists and genres open their own page. */
export function actionForNode(node: EgoNode, centerId: string): NodeAction {
  if (node.id === centerId) return { type: "none" };
  if (node.entity_type === "movie" || node.entity_type === "tv_series") return { type: "recenter", slug: node.slug };
  const href = detailPathFor(node.entity_type, node.slug);
  return href ? { type: "navigate", href } : { type: "none" };
}

export function centerNodeOf(graph: EgoGraph | null): EgoNode | null {
  return graph?.nodes.find((n) => n.id === graph.center_id) ?? null;
}
