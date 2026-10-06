import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-session";

const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  const secret = getAdminJwtSecret();
  if (!secret) {
    console.error("ADMIN_JWT_SECRET is not set — refusing all admin sessions");
    return redirectToLogin(request);
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.type !== "admin_access") {
      return redirectToLogin(request);
    }
  } catch {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

// ADMIN_JWT_SECRET must equal the backend's JWT_SECRET (the middleware verifies
// the admin session cookie locally, without a round trip to the API). It is a
// plain runtime environment variable (Liara app env).
//
// .trim() guards against a trailing newline/space ending up in the secret
// (a clipboard paste or `cat secret.txt`), which would silently break every
// verification with a signature mismatch.
function getAdminJwtSecret(): string | undefined {
  const trimmed = process.env.ADMIN_JWT_SECRET?.trim();
  return trimmed || undefined;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
