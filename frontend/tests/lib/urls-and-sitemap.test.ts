import { describe, expect, it } from "vitest";
import { decodeListSlug, encodeListSlug, listHref } from "@/lib/list-url";
import { encodePath, sitemapIndex, urlset, xmlEscape, SITEMAP_CHUNK } from "@/lib/sitemap";

describe("list slugs", () => {
  const slug = "برترین-های-نولان";

  it("builds the same encoded link from an encoded or a decoded slug", () => {
    expect(listHref(slug)).toBe(listHref(encodeURIComponent(slug)));
    expect(listHref(slug)).toBe(`/lists/${encodeURIComponent(slug)}`);
  });
  it("round-trips and survives malformed percent-encoding", () => {
    expect(decodeListSlug(encodeListSlug(slug))).toBe(slug);
    expect(decodeListSlug("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("sitemap helpers", () => {
  it("escapes XML special characters", () => {
    expect(xmlEscape(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&apos;");
  });
  it("percent-encodes every path segment but keeps the slashes", () => {
    expect(encodePath("/person/تیم-1")).toBe(`/person/${encodeURIComponent("تیم-1")}`);
  });
  it("renders a urlset with optional fields only when present", () => {
    const xml = urlset([
      { loc: "https://x.test/a?b=1&c=2" },
      { loc: "https://x.test/b", lastmod: "2026-01-02T00:00:00Z", changefreq: "weekly", priority: "0.8" },
    ]);
    expect(xml).toContain("<loc>https://x.test/a?b=1&amp;c=2</loc>");
    expect(xml).toContain("<lastmod>2026-01-02T00:00:00.000Z</lastmod>");
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml.match(/<changefreq>/g)).toHaveLength(1);
  });
  it("lists every sitemap file in the index", () => {
    const xml = sitemapIndex(["static.xml", "movie-1.xml"]);
    expect(xml).toContain("/sitemaps/static.xml</loc>");
    expect(xml).toContain("/sitemaps/movie-1.xml</loc>");
  });
  it("keeps each chunk under the protocol limit of 50,000 URLs", () => {
    expect(SITEMAP_CHUNK).toBeLessThanOrEqual(50000);
  });
});
