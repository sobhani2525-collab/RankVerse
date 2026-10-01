export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cinemagozin.ir").replace(/\/+$/, "");
export const SITE_NAME = "سینماگزین";
export const SITE_TAGLINE = "نقشه‌ی برترین‌های سینما";
export const SITE_DESCRIPTION =
  "رتبه‌بندی فیلم‌ها و سریال‌ها بر پایه‌ی گراف دانش، ترکیب رأی کاربران و هوش مصنوعی.";
export const SITE_LOCALE = "fa_IR";

/** Absolute URL for a site path ("/lists/x" -> "https://host/lists/x"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Collapses whitespace and cuts at a word boundary, adding "…" when trimmed. */
export function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
