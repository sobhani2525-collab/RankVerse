/**
 * Composes the "PersianTitle (EnglishTitle)" display format for a movie/tv
 * entity, e.g. "پدرخوانده (Godfather)". Falls back to just the plain title
 * when there's no Persian translation on file (title_fa is null -- either
 * the entity hasn't been re-synced since fa-IR fetching was added, or TMDb
 * has no Persian translation for it; see sync/normalizer.py's
 * _persian_title for how title_fa is decided).
 *
 * Year is deliberately NOT appended here: every place that renders a title
 * already shows the year separately nearby (a line under the heading, a
 * badge on a list row), so folding it into this string too would just
 * duplicate it.
 */
export function displayTitle(entity: { title: string; title_fa?: string | null }): string {
  return entity.title_fa ? `${entity.title_fa} (${entity.title})` : entity.title;
}

/**
 * The same two titles as displayTitle, split for cards that put them on two
 * lines (see components/entities/card-title.tsx): the Persian title first,
 * the original one under it. With no Persian title on file -- or one that is
 * just the original title again -- there is only the one line.
 */
export function splitTitle(entity: { title: string; title_fa?: string | null }): {
  primary: string;
  secondary: string | null;
} {
  const fa = entity.title_fa?.trim();
  if (!fa || fa === entity.title) return { primary: entity.title, secondary: null };
  return { primary: fa, secondary: entity.title };
}
