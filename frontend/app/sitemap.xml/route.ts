import { getEntitySitemapCounts } from "@/lib/api";
import { SITEMAP_CHUNK, SITEMAP_ENTITY_TYPES, sitemapIndex, xmlResponse } from "@/lib/sitemap";

export const revalidate = 3600;

/** Sitemap index: static pages, lists, then one file per SITEMAP_CHUNK entities of each type. */
export async function GET() {
  const files = ["static.xml", "lists.xml"];
  try {
    const counts = await getEntitySitemapCounts();
    for (const type of SITEMAP_ENTITY_TYPES) {
      const chunks = Math.ceil((counts[type] ?? 0) / SITEMAP_CHUNK);
      for (let i = 1; i <= chunks; i++) files.push(`${type}-${i}.xml`);
    }
  } catch {
    // API down: still serve the static part.
  }
  return xmlResponse(sitemapIndex(files));
}
