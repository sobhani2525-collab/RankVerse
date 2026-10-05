import { SITE_URL, absoluteUrl } from "@/lib/site";
import type { SitemapEntityType } from "@/lib/api";

/** Sitemaps allow 50,000 URLs per file; stay well under it. */
export const SITEMAP_CHUNK = 10000;

export const SITEMAP_ENTITY_ROUTE: Record<SitemapEntityType, { base: string; priority: string; changefreq: string }> = {
  movie: { base: "/movies", priority: "0.8", changefreq: "weekly" },
  tv_series: { base: "/tv-series", priority: "0.8", changefreq: "weekly" },
  genre: { base: "/genre", priority: "0.6", changefreq: "weekly" },
  person: { base: "/person", priority: "0.5", changefreq: "monthly" },
};

export const SITEMAP_ENTITY_TYPES = Object.keys(SITEMAP_ENTITY_ROUTE) as SitemapEntityType[];

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Percent-encodes each path segment (Persian slugs), as the sitemap protocol requires. */
export function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export function urlset(entries: { loc: string; lastmod?: string | null; changefreq?: string; priority?: string }[]): string {
  const rows = entries.map(
    (e) =>
      `<url><loc>${xmlEscape(e.loc)}</loc>` +
      (e.lastmod ? `<lastmod>${xmlEscape(new Date(e.lastmod).toISOString())}</lastmod>` : "") +
      (e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : "") +
      (e.priority ? `<priority>${e.priority}</priority>` : "") +
      `</url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

export function sitemapIndex(files: string[]): string {
  const rows = files.map((f) => `<sitemap><loc>${xmlEscape(`${SITE_URL}/sitemaps/${f}`)}</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</sitemapindex>\n`;
}

export { absoluteUrl };
