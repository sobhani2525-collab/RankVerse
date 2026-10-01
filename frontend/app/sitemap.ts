import type { MetadataRoute } from "next";
import { getListsSitemap } from "@/lib/api";
import { listHref } from "@/lib/list-url";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 3600;

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/rankings", priority: 0.9, changeFrequency: "daily" },
  { path: "/lists", priority: 0.8, changeFrequency: "daily" },
  { path: "/battles", priority: 0.6, changeFrequency: "weekly" },
  { path: "/people", priority: 0.6, changeFrequency: "weekly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
  }));

  try {
    const lists = await getListsSitemap();
    for (const list of lists) {
      entries.push({
        // listHref percent-encodes the Persian slug, as the sitemap protocol requires.
        url: absoluteUrl(listHref(list.slug)),
        lastModified: list.updated_at ? new Date(list.updated_at) : undefined,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // API down: still serve the static part.
  }
  return entries;
}
