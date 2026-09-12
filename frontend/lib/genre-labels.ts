/**
 * Persian display labels for genre names. The underlying data (entity
 * titles/slugs synced from TMDb, ARCHETYPE_MAP keys on the backend) stays
 * English/canonical -- this dictionary only affects what's rendered.
 *
 * Falls back to a humanized version of the English name for anything not
 * in the map (e.g. a genre TMDb adds later that hasn't been translated
 * here yet), rather than failing or showing a raw slug.
 */
const GENRE_LABELS: Record<string, string> = {
  action: "اکشن",
  adventure: "ماجراجویی",
  animation: "انیمیشن",
  comedy: "کمدی",
  crime: "جنایی",
  documentary: "مستند",
  drama: "درام",
  family: "خانوادگی",
  fantasy: "فانتزی",
  history: "تاریخی",
  horror: "ترسناک",
  music: "موسیقی",
  mystery: "معمایی",
  romance: "عاشقانه",
  "science-fiction": "علمی-تخیلی",
  "sci-fi": "علمی-تخیلی",
  "tv-movie": "فیلم تلویزیونی",
  thriller: "پرتعلیق",
  war: "جنگی",
  western: "وسترن",
  kids: "کودک",
  news: "خبری",
  reality: "رئالیتی",
  soap: "درام خانوادگی",
  talk: "گفتگو",
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function genreLabel(input: string): string {
  const slug = toSlug(input);
  return GENRE_LABELS[slug] ?? humanize(slug);
}
