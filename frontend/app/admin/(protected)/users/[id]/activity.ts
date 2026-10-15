import { detailPathFor } from "@/lib/entity-routes";
import { listHref } from "@/lib/list-url";

export type ActivityKind = "ratings" | "favorites" | "lists" | "comments";

export interface ActivityRow {
  id: string;
  created_at: string;
  // ratings / favorites
  entity_type?: string;
  entity_title?: string;
  entity_slug?: string;
  score?: number;
  // lists
  title?: string;
  slug?: string;
  visibility?: string;
  // comments
  target_kind?: "list" | "entity";
  target_title?: string;
  target_slug?: string;
  body?: string;
}

/** Public-site link for an activity row (opened in a new tab), or null when it has none. */
export function activityHref(kind: ActivityKind, row: ActivityRow): string | null {
  if (kind === "lists") return row.slug ? listHref(row.slug) : null;
  if (kind === "comments") {
    if (!row.target_slug) return null;
    return row.target_kind === "list" ? listHref(row.target_slug) : detailPathFor("person", row.target_slug);
  }
  return row.entity_type && row.entity_slug ? detailPathFor(row.entity_type, row.entity_slug) : null;
}

export function activityTitle(kind: ActivityKind, row: ActivityRow): string {
  if (kind === "lists") return row.title ?? "";
  if (kind === "comments") return row.target_title ?? "";
  return row.entity_title ?? "";
}
