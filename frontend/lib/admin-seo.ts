/** Admin SEO page: GET /admin/seo/overview (app/modules/admin/seo_schemas.py) and the page inspector. */
import { toFaDigits } from "@/lib/format-number";

export interface SeoTitleContent {
  total: number;
  missing_title_fa: number;
  missing_overview_fa: number;
  machine_overview: number;
  missing_poster: number;
}

export interface AdminSeoOverview {
  sitemap: { movie: number; tv_series: number; person: number; genre: number; lists: number };
  movies: SeoTitleContent;
  tv_series: SeoTitleContent;
  people: { total: number; without_credits: number; missing_biography: number; english_biography: number };
  lists: { indexable: number; empty_public: number; hidden: number; private: number };
  battles: { public: number; unlisted: number; hidden: number };
  gaps: {
    id: string;
    entity_type: string;
    title: string;
    slug: string;
    year: number | null;
    vote_count: number | null;
    missing: ("title_fa" | "overview_fa" | "poster")[];
  }[];
  generated_at: string;
}

/** What a crawler reads off one page (see app/api/admin/seo-inspect). */
export interface SeoPageMeta {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  lang: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  h1Count: number;
  jsonLdTypes: string[];
}

export interface SeoInspection extends SeoPageMeta {
  url: string;
  status: number;
  ms: number;
  xRobotsTag: string | null;
  redirect: string | null; // Location of a 3xx answer
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Attributes of one start tag, lower-cased names, decoded values. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return out;
}

function collectTypes(node: unknown, into: Set<string>) {
  if (Array.isArray(node)) node.forEach((n) => collectTypes(n, into));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    if (typeof t === "string") into.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && into.add(x));
    if (o["@graph"]) collectTypes(o["@graph"], into);
  }
}

/** Reads the SEO-relevant tags out of a rendered HTML page (Next may stream metadata into the body, so the whole document is scanned). */
export function parseSeoHtml(html: string): SeoPageMeta {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (key: string) => {
    const hit = metas.find((a) => (a.name ?? a.property ?? "").toLowerCase() === key);
    return hit?.content?.trim() || null;
  };
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => attrs(m[0]))
    .find((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  const types = new Set<string>();
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectTypes(JSON.parse(m[1]), types);
    } catch {
      // A broken JSON-LD block is simply not reported.
    }
  }
  return {
    title: title ? decode(title[1]).trim() || null : null,
    description: meta("description"),
    canonical: canonical?.href ?? null,
    robots: meta("robots"),
    lang: htmlTag ? attrs(htmlTag[0]).lang ?? null : null,
    ogTitle: meta("og:title"),
    ogDescription: meta("og:description"),
    ogImage: meta("og:image"),
    twitterCard: meta("twitter:card"),
    h1Count: (html.match(/<h1\b/gi) ?? []).length,
    jsonLdTypes: [...types],
  };
}

export type SeoCheck = { level: "ok" | "warn" | "error"; text: string };

/** Plain-language checks on an inspected page, worst first. */
export function seoChecks(p: SeoInspection): SeoCheck[] {
  const out: SeoCheck[] = [];
  if (p.redirect) out.push({ level: "warn", text: `صفحه با کد ${toFaDigits(p.status)} به آدرس دیگری می‌رود؛ همان آدرس مقصد را بررسی کنید.` });
  else if (p.status !== 200) out.push({ level: "error", text: `پاسخ صفحه ${toFaDigits(p.status)} است، نه ۲۰۰.` });
  const noindex = [p.robots, p.xRobotsTag].some((r) => r && /noindex/i.test(r));
  if (noindex) out.push({ level: "warn", text: "صفحه noindex است و در نتایج جستجو نمی‌آید." });
  if (!p.title) out.push({ level: "error", text: "عنوان (title) ندارد." });
  else if (p.title.length > 65) out.push({ level: "warn", text: `عنوان ${toFaDigits(p.title.length)} نویسه است؛ گوگل معمولاً حدود ۶۰ نویسه را نشان می‌دهد.` });
  if (!p.description) out.push({ level: "error", text: "توضیحات متا (description) ندارد." });
  else if (p.description.length < 70) out.push({ level: "warn", text: `توضیحات فقط ${toFaDigits(p.description.length)} نویسه است؛ کوتاه است.` });
  else if (p.description.length > 170) out.push({ level: "warn", text: `توضیحات ${toFaDigits(p.description.length)} نویسه است و بریده می‌شود.` });
  if (!p.canonical) out.push({ level: "warn", text: "آدرس canonical ندارد." });
  else {
    try {
      if (new URL(p.canonical, p.url).pathname !== new URL(p.url).pathname)
        out.push({ level: "warn", text: "canonical به آدرس دیگری اشاره می‌کند؛ این صفحه نسخهٔ تکراری حساب می‌شود." });
    } catch {
      out.push({ level: "warn", text: "آدرس canonical نامعتبر است." });
    }
  }
  if (!p.ogImage) out.push({ level: "warn", text: "تصویر og:image ندارد؛ پیش‌نمایش اشتراک‌گذاری بدون عکس است." });
  if (p.h1Count === 0) out.push({ level: "warn", text: "تیتر h1 ندارد." });
  else if (p.h1Count > 1) out.push({ level: "warn", text: `${toFaDigits(p.h1Count)} تیتر h1 دارد.` });
  if (out.length === 0) out.push({ level: "ok", text: "مشکلی پیدا نشد." });
  const rank = { error: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
