import type { ListDetail, ListEdge, ListItem } from "./types";
import { detailPathFor } from "./entity-routes";

/**
 * Shared helpers for the list detail "constellation" page
 * (components/list-detail/*): edge colors, type labels, poster urls.
 * Entity color code: movie/series = gold, people = violet, genre = teal,
 * year = neutral.
 */

export type EdgeKind = ListEdge["kind"];

export const EDGE_STYLES: Record<
  EdgeKind,
  { line: string; ring: string; dot: string; chip: string }
> = {
  people: {
    line: "border-solid border-violet-light",
    ring: "border-solid border-violet-light",
    dot: "bg-violet-light",
    chip: "border-violet-light/60 text-violet-light hover:border-violet-light",
  },
  genre: {
    line: "border-solid border-teal",
    ring: "border-solid border-teal",
    dot: "bg-teal",
    chip: "border-teal/60 text-teal hover:border-teal",
  },
  none: {
    line: "border-dashed border-dim/50",
    ring: "border-dashed border-dim/60",
    dot: "bg-dim/60",
    chip: "border-border text-dim",
  },
};

export const PEOPLE_CHIP = "border-violet-light/45 text-violet-light hover:border-violet-light";
export const GENRE_CHIP = "border-teal/45 text-teal hover:border-teal";
export const TAG_CHIP = "border-border text-muted";

const TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  movie: { en: "MOVIE", fa: "فیلم" },
  tv_series: { en: "SERIES", fa: "سریال" },
  person: { en: "PERSON", fa: "شخص" },
  genre: { en: "GENRE", fa: "ژانر" },
  track: { en: "TRACK", fa: "قطعه" },
};

export function typeLabel(entityType: string): { en: string; fa: string } {
  return TYPE_LABELS[entityType] ?? { en: entityType.toUpperCase(), fa: entityType };
}

/** Entity types that can be rated (StarRating) and battled on this page. */
export function isRateable(entityType: string): boolean {
  return entityType === "movie" || entityType === "tv_series";
}

export function posterUrl(posterPath: string | null | undefined, size = "w342"): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null;
}

export function entityHref(entityType: string, slug: string): string | null {
  return detailPathFor(entityType, slug);
}

/** Connections shown in the hero: linked edges plus backlinks. */
export function connectionCount(detail: ListDetail): number {
  const linked = (detail.edges ?? []).filter((e) => e.kind !== "none").length;
  return linked + (detail.backlinks ?? []).length;
}

/**
 * /battles link for one item's "نبرد" button: against the item it's
 * linked to on the spine (next, then previous), else the nearest other
 * item of the same type. Falls back to a plain category battle when the
 * list has nothing of the same type to pair it with.
 */
export function battleHrefFor(items: ListItem[], edges: ListEdge[], index: number): string {
  const item = items[index];
  const type = item.entity.entity_type;
  const sameType = (i: number) => i >= 0 && i < items.length && i !== index && items[i].entity.entity_type === type;

  const candidates: number[] = [];
  if (edges[index] && edges[index].kind !== "none") candidates.push(index + 1);
  if (edges[index - 1] && edges[index - 1].kind !== "none") candidates.push(index - 1);
  for (let d = 1; d < items.length; d++) candidates.push(index + d, index - d);

  const opponent = candidates.find(sameType);
  const params = new URLSearchParams({ category: type });
  if (opponent !== undefined) {
    params.set("left_id", item.entity.id);
    params.set("right_id", items[opponent].entity.id);
  }
  return `/battles?${params.toString()}`;
}

/** True when `iso` falls on today's date in Tehran. */
export function isUpdatedToday(iso: string, now: Date = new Date()): boolean {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
  return day(new Date(iso)) === day(now);
}
