import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

// The admin JWT lives only in an httpOnly cookie (never exposed to client
// JS), so the settings page can't call the backend directly with a Bearer
// header the way server components can. This route reads the cookie
// server-side and forwards the request, same pattern as /api/admin/session.
export async function PATCH(request: NextRequest) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ data: null, meta: null, error: { code: "unauthorized", message: "Not authenticated" } }, { status: 401 });
  }

  const body = await request.text();
  const res = await fetch(`${API_BASE}/admin/auth/password`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}
