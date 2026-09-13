import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  const { access_token } = await request.json();
  if (typeof access_token !== "string" || !access_token) {
    return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
  }

  let maxAgeSeconds = 30 * 60;
  try {
    const { exp } = decodeJwt(access_token);
    if (exp) {
      maxAgeSeconds = Math.max(0, exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    return NextResponse.json({ error: "Invalid access_token" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}
