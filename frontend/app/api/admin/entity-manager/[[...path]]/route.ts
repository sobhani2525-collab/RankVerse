import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

// Cookie-to-Bearer proxy for /admin/entity-manager (the admin JWT is httpOnly).
async function forward(request: NextRequest, path: string[] | undefined) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ data: null, meta: null, error: { code: "unauthorized", message: "Not authenticated" } }, { status: 401 });
  }

  const suffix = path && path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const res = await fetch(`${API_BASE}/admin/entity-manager${suffix}${request.nextUrl.search}`, {
    method: request.method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  });
  const json = await res.json();

  const row = json?.data;
  if (request.method === "PATCH" && res.ok && row?.slug) {
    if (row.entity_type === "movie") revalidatePath(`/movies/${row.slug}`);
    else if (row.entity_type === "tv_series") revalidatePath(`/tv-series/${row.slug}`);
    else if (row.entity_type === "person") revalidatePath(`/people/${row.slug}`);
  }
  return NextResponse.json(json, { status: res.status });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return forward(request, (await params).path);
}
