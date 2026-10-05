import { getEntitySitemapPage, getListsSitemap, SitemapEntityType } from "@/lib/api";
import { listHref } from "@/lib/list-url";
import {
  SITEMAP_CHUNK,
  SITEMAP_ENTITY_ROUTE,
  absoluteUrl,
  encodePath,
  urlset,
  xmlResponse,
} from "@/lib/sitemap";

export const revalidate = 3600;

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/rankings", priority: "0.9", changefreq: "daily" },
  { path: "/rankings?type=tv_series", priority: "0.9", changefreq: "daily" },
  { path: "/lists", priority: "0.8", changefreq: "daily" },
  { path: "/battles", priority: "0.6", changefreq: "weekly" },
  { path: "/people", priority: "0.6", changefreq: "weekly" },
];

const ENTITY_FILE = /^(movie|tv_series|person|genre)-(\d+)\.xml$/;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;

  if (file === "static.xml") {
    return xmlResponse(urlset(STATIC_ROUTES.map((r) => ({ loc: absoluteUrl(r.path), changefreq: r.changefreq, priority: r.priority }))));
  }

  if (file === "lists.xml") {
    const lists = await getListsSitemap().catch(() => []);
    return xmlResponse(
      urlset(
        lists.map((l) => ({
          // listHref percent-encodes the Persian slug.
          loc: absoluteUrl(listHref(l.slug)),
          lastmod: l.updated_at,
          changefreq: "weekly",
          priority: "0.7",
        })),
      ),
    );
  }

  const match = ENTITY_FILE.exec(file);
  const chunk = match ? Number.parseInt(match[2], 10) : 0;
  if (!match || chunk < 1) return new Response("Not found", { status: 404 });

  const type = match[1] as SitemapEntityType;
  const route = SITEMAP_ENTITY_ROUTE[type];
  let rows: { slug: string; updated_at: string | null }[];
  try {
    rows = await getEntitySitemapPage(type, (chunk - 1) * SITEMAP_CHUNK, SITEMAP_CHUNK);
  } catch {
    // Not a 404: a crawler should retry later, and ISR keeps the last good copy.
    return new Response("Sitemap temporarily unavailable", { status: 503 });
  }
  if (rows.length === 0) return new Response("Not found", { status: 404 });

  return xmlResponse(
    urlset(
      rows.map((r) => ({
        loc: absoluteUrl(encodePath(`${route.base}/${r.slug}`)),
        lastmod: r.updated_at,
        changefreq: route.changefreq,
        priority: route.priority,
      })),
    ),
  );
}
