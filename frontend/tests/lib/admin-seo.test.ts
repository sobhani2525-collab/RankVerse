import { describe, expect, it } from "vitest";
import { parseSeoHtml, seoChecks, type SeoInspection } from "@/lib/admin-seo";

const PAGE = `<!DOCTYPE html><html lang="fa" dir="rtl"><head>
<title>رستگاری در شاوشنک (۱۹۹۴) | سینماگزین</title>
<meta name="description" content="فیلم &quot;رستگاری&quot; با امتیاز ترکیبی ۹٫۱ از ۱۰ &amp; بیشتر. کارگردان: فرانک دارابونت. بازیگران: تیم رابینز، مورگان فریمن."/>
<meta property="og:image" content="https://image.tmdb.org/t/p/w780/x.jpg">
<meta content="summary_large_image" name="twitter:card">
<link rel="canonical" href="https://cinemagozin.ir/movies/the-shawshank-redemption"/>
<meta name="robots" content="index, follow"/>
</head><body><h1>رستگاری</h1>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Movie"},{"@type":["BreadcrumbList"]}]}</script>
<script type="application/ld+json">{broken</script>
</body></html>`;

const base = (over: Partial<SeoInspection> = {}): SeoInspection => ({
  ...parseSeoHtml(PAGE),
  url: "https://cinemagozin.ir/movies/the-shawshank-redemption",
  status: 200,
  ms: 120,
  xRobotsTag: null,
  redirect: null,
  ...over,
});

describe("parseSeoHtml", () => {
  it("reads title, metas in any attribute order, canonical, h1 and JSON-LD types", () => {
    const p = parseSeoHtml(PAGE);
    expect(p.title).toBe("رستگاری در شاوشنک (۱۹۹۴) | سینماگزین");
    expect(p.description).toMatch(/^فیلم "رستگاری" با امتیاز ترکیبی ۹٫۱ از ۱۰ & بیشتر\./);
    expect(p.twitterCard).toBe("summary_large_image");
    expect(p.ogImage).toMatch(/x\.jpg$/);
    expect(p.canonical).toBe("https://cinemagozin.ir/movies/the-shawshank-redemption");
    expect(p.robots).toBe("index, follow");
    expect(p.lang).toBe("fa");
    expect(p.h1Count).toBe(1);
    expect(p.jsonLdTypes).toEqual(["Movie", "BreadcrumbList"]);
  });

  it("returns nulls for a page without tags", () => {
    const p = parseSeoHtml("<html><body>hi</body></html>");
    expect(p.title).toBeNull();
    expect(p.description).toBeNull();
    expect(p.h1Count).toBe(0);
  });
});

describe("seoChecks", () => {
  it("passes a complete page", () => {
    expect(seoChecks(base())).toEqual([{ level: "ok", text: "مشکلی پیدا نشد." }]);
  });

  it("flags noindex, a foreign canonical and missing tags, errors first", () => {
    const checks = seoChecks(
      base({ robots: "noindex, follow", canonical: "/rankings", description: null, ogImage: null }),
    );
    expect(checks[0].level).toBe("error");
    expect(checks.map((c) => c.text).join(" ")).toMatch(/noindex/);
    expect(checks.some((c) => c.text.includes("canonical"))).toBe(true);
    expect(checks.some((c) => c.text.includes("og:image"))).toBe(true);
  });

  it("notes a redirect instead of calling it an error", () => {
    const checks = seoChecks(base({ status: 308, redirect: "https://cinemagozin.ir/movies/x" }));
    expect(checks.every((c) => c.level !== "error")).toBe(true);
  });
});
