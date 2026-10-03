import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

// Same cookie-to-Bearer proxy as /api/admin/lists: the admin JWT is httpOnly,
// so the browser can't call /admin/daily-battles on the backend directly. The
// daily battle is fetched client-side with no-store, so nothing to revalidate.
async function forward(request: NextRequest, path: string[] | undefined) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ data: null, meta: null, error: { code: "unauthorized", message: "Not authenticated" } }, { status: 401 });
  }

  const suffix = path && path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const res = await fetch(`${API_BASE}/admin/daily-battles${suffix}${request.nextUrl.search}`, {
    method: request.method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function POST(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function PUT(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
