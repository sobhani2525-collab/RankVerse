import type { ListSummary } from "@/lib/types";

export type ListTab = "foryou" | "fresh" | "picked";

export const LIST_TABS: { key: ListTab; label: string }[] = [
  { key: "foryou", label: "پیشنهادی برای تو" },
  { key: "fresh", label: "تازه" },
  { key: "picked", label: "برگزیده‌ها" },
];

/** Query for each tab; "picked" has its own endpoint (admin-featured lists), so it has no discover query. */
export function discoverQueryFor(tab: ListTab): { sort: "newest" | "popular"; page_size: number } | null {
  if (tab === "picked") return null;
  return { sort: tab === "fresh" ? "newest" : "popular", page_size: POOL_SIZE };
}

/** Each tab fetches a wider pool than it shows; the client samples from it so the cards vary per visit. */
export const POOL_SIZE = 20;

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The tab's cards without the weekly featured list, which already has its own big card. */
export function withoutFeatured(lists: ListSummary[], featuredSlug: string | null, max = 5): ListSummary[] {
  return lists.filter((l) => l.slug !== featuredSlug).slice(0, max);
}
