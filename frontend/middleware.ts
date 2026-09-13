import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getCloudflareContext } from "@opennextjs/cloudflare";
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
  } catch (err) {
    // TEMP DEBUG — remove once production login is confirmed working.
    console.error("DEBUG admin jwtVerify failed:", err);
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

// `wrangler secret put` values are normally mirrored onto process.env
// before any handler runs (see @opennextjs/cloudflare's populateProcessEnv
// in its worker init, which copies every string binding across before the
// middleware bundle is invoked). If that ever doesn't happen for this
// bundle specifically, fall back to reading the binding straight off the
// Cloudflare request context, which is always populated in production.
//
// .trim() guards against a trailing newline/space ending up in the secret
// (e.g. `cat secret.txt | wrangler secret put ...` keeps the file's
// trailing newline, or a clipboard paste picks up trailing whitespace) —
// that would silently break every verification with a signature mismatch
// even though the "real" secret value is otherwise correct.
function getAdminJwtSecret(): string | undefined {
  let secret = process.env.ADMIN_JWT_SECRET;
  let source = "process.env";

  if (!secret) {
    try {
      const env = getCloudflareContext().env as Record<string, string | undefined>;
      secret = env.ADMIN_JWT_SECRET;
      source = "cloudflareContext";
    } catch (err) {
      // TEMP DEBUG — remove once production login is confirmed working.
      console.error("DEBUG getCloudflareContext() failed:", err);
    }
  }

  // TEMP DEBUG — remove once production login is confirmed working.
  console.error(`DEBUG admin secret source: ${source}, length: ${secret?.length ?? 0}`);

  const trimmed = secret?.trim();
  return trimmed || undefined;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/admin/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
