// Filter and paging options shared by every ranked list (/rankings and /genre/{slug}).

export const RANKING_PAGE_SIZE = 24;

export type RankingType = "movie" | "tv_series";

export const SORT_OPTIONS = [
  ["score", "امتیاز RankVerse"],
  ["votes", "بیشترین رأی"],
  ["year_desc", "جدیدترین"],
  ["year_asc", "قدیمی‌ترین"],
] as const;

export const ORIGIN_OPTIONS = [
  ["all", "همه"],
  ["persian", "فارسی‌زبان"],
  ["foreign", "خارجی"],
] as const;

// First year of each decade; the last entry covers everything before 1950.
export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];

export function parsePage(value: string | undefined): number {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

export function parseRankingType(value: string | undefined): RankingType {
  return value === "tv_series" ? "tv_series" : "movie";
}

export function parseSort(value: string | undefined): string {
  return SORT_OPTIONS.some(([v]) => v === value) ? value! : "score";
}

export function parseOrigin(value: string | undefined): string {
  return ORIGIN_OPTIONS.some(([v]) => v === value) ? value! : "all";
}

export function parseDecade(value: string | undefined): number | undefined {
  const n = Number.parseInt(value ?? "", 10);
  return DECADES.includes(n) ? n : undefined;
}
