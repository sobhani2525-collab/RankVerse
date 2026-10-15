import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

/**
 * Cookie-to-Bearer proxy for an /admin/<prefix> backend area (the admin JWT is
 * httpOnly, so the browser can't call the backend itself). The client's IP and
 * User-Agent are forwarded so the backend audit log records who really acted.
 * File responses (exports) are streamed through untouched.
 */
export async function forwardToAdmin(request: NextRequest, prefix: string, path: string[] | undefined) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ data: null, meta: null, error: { code: "unauthorized", message: "Not authenticated" } }, { status: 401 });
  }

  const suffix = path && path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["User-Agent"] = userAgent;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/admin/${prefix}${suffix}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ data: null, meta: null, error: { code: "upstream_unreachable", message: "سرور در دسترس نیست" } }, { status: 502 });
  }

  if ((res.headers.get("content-disposition") ?? "").startsWith("attachment")) {
    const out = new Headers();
    for (const h of ["content-type", "content-disposition", "cache-control"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new NextResponse(res.body, { status: res.status, headers: out });
  }
  const json = await res.json().catch(() => ({ data: null, meta: null, error: { code: "bad_response", message: `خطا (${res.status})` } }));
  return NextResponse.json(json, { status: res.status });
}
