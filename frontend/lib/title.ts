const DIGIT_MAP: Record<string, string> = {};
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((c, i) => (DIGIT_MAP[c] = String(i)));
"٠١٢٣٤٥٦٧٨٩".split("").forEach((c, i) => (DIGIT_MAP[c] = String(i)));

const latinDigits = (s: string) => s.replace(/[۰-۹٠-٩]/g, (c) => DIGIT_MAP[c]).trim();

/**
 * The Persian title worth showing next to the original, or null. A Persian
 * title that is just the original again -- including a number-only title such
 * as "1917" written as "۱۹۱۷" -- is not a translation, so it is dropped.
 */
export function distinctFa(entity: { title: string; title_fa?: string | null }): string | null {
  const fa = entity.title_fa?.trim();
  if (!fa || latinDigits(fa) === latinDigits(entity.title)) return null;
  return fa;
}

/**
 * Composes the "PersianTitle (EnglishTitle)" display format for a movie/tv
 * entity, e.g. "پدرخوانده (Godfather)". Falls back to just the plain title
 * when there's no (distinct) Persian translation on file.
 *
 * Year is deliberately NOT appended here: every place that renders a title
 * already shows the year separately nearby.
 */
export function displayTitle(entity: { title: string; title_fa?: string | null }): string {
  const fa = distinctFa(entity);
  return fa ? `${fa} (${entity.title})` : entity.title;
}

/**
 * The same two titles as displayTitle, split for cards that put them on two
 * lines (see components/entities/card-title.tsx).
 */
export function splitTitle(entity: { title: string; title_fa?: string | null }): {
  primary: string;
  secondary: string | null;
} {
  const fa = distinctFa(entity);
  if (!fa) return { primary: entity.title, secondary: null };
  return { primary: fa, secondary: entity.title };
}
