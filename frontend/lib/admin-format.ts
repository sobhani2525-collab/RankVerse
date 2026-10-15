/** "۱۴۰۵/۷/۲۳، ۱۷:۰۵:۲۴ — 15/10/2026, 17:05:24": both calendars for tooltips. */
export function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString("fa-IR")} — ${d.toLocaleString("en-GB")}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}
