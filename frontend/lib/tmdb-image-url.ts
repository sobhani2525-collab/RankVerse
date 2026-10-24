// TMDb's image CDN is filtered inside Iran, so the browser never talks to it
// directly: every poster goes through NEXT_PUBLIC_TMDB_IMAGE_BASE (no trailing
// slash) -- a Cloudflare mirror, or our own /tmdb-img/... route that caches
// posters on the Liara app (lib/image-proxy.ts), the default in production.
const TMDB_ORIGIN = "https://image.tmdb.org/t/p/";
//
// Local `next dev` skips the proxy and loads from TMDb directly (as before);
// set NEXT_PUBLIC_TMDB_IMAGE_BASE in .env.local to force a proxy/mirror there.
const PROXY_BASE = (
  process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || (process.env.NODE_ENV === "production" ? "/tmdb-img" : "")
).replace(/\/+$/, "");

// Largest size the browser may fetch through the mirror; no page needs more
// than w500, and "original" can be 500KB+. If posters are ever served straight
// from Cloudflare again, drop this to 300: Iranian networks cut connections to
// Cloudflare's IPs after ~58KB (measured 2026-10-23), and w300 posters stay
// under ~52KB while w342/w500 often go over.
export const MAX_MIRROR_WIDTH = 500;

/** Shrinks a TMDb size segment ("w500", "h632", "original") to the mirror cap. */
export function capTmdbSize(size: string): string {
  const width = /^w(\d+)$/.exec(size);
  return width && Number(width[1]) <= MAX_MIRROR_WIDTH ? size : `w${MAX_MIRROR_WIDTH}`;
}

export function proxyTmdbUrl(url: string): string {
  if (!PROXY_BASE || !url.startsWith(TMDB_ORIGIN)) return url;
  const rest = url.slice(TMDB_ORIGIN.length);
  const slash = rest.indexOf("/");
  const path = slash > 0 ? `${capTmdbSize(rest.slice(0, slash))}${rest.slice(slash)}` : rest;
  return `${PROXY_BASE}/${path}`;
}
