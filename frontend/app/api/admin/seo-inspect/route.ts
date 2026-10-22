import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminMe } from "@/lib/admin-api";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { parseSeoHtml, type SeoInspection } from "@/lib/admin-seo";

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const MAX_BYTES = 3_000_000;

function fail(status: number, message: string) {
  return NextResponse.json({ data: null, meta: null, error: { code: "seo_inspect", message } }, { status });
}

/**
 * Admin SEO inspector: renders one of this site's own pages the way Googlebot
 * would get it and reports its tags. Only same-origin paths, and never
 * /admin or /api, so it can't be pointed at another host.
 */
export async function GET(request: NextRequest) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return fail(401, "Not authenticated");
  try {
    await getAdminMe(token);
  } catch {
    return fail(401, "Not authenticated");
  }

  const raw = (request.nextUrl.searchParams.get("path") ?? "").trim();
  const origin = request.nextUrl.origin;
  let target: URL;
  try {
    // A full URL of this site is accepted too; only its path is used.
    const path = raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw).pathname + new URL(raw).search : raw;
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error();
    target = new URL(path, origin);
  } catch {
    return fail(400, "آدرس باید مسیری از همین سایت باشد، مثل ‎/movies/…‎");
  }
  if (target.origin !== origin || /^\/(admin|api)(\/|$)/.test(target.pathname)) {
    return fail(400, "این مسیر قابل بررسی نیست.");
  }

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(target, { headers: { "User-Agent": GOOGLEBOT, Accept: "text/html" }, redirect: "manual", cache: "no-store" });
  } catch {
    return fail(502, "صفحه در دسترس نبود.");
  }
  const location = res.headers.get("location");
  const html = (res.headers.get("content-type") ?? "").includes("text/html") ? (await res.text()).slice(0, MAX_BYTES) : "";

  const data: SeoInspection = {
    url: target.toString(),
    status: res.status,
    ms: Date.now() - started,
    xRobotsTag: res.headers.get("x-robots-tag"),
    redirect: location ? new URL(location, target).toString() : null,
    ...parseSeoHtml(html),
  };
  return NextResponse.json({ data, meta: null, error: null }, { headers: { "Cache-Control": "private, no-store" } });
}
