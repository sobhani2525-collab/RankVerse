// TMDb's image CDN is filtered inside Iran, so the browser never talks to it
// directly: every poster goes through our own origin (/tmdb-img/..., a
// rewrite in next.config.mjs that the server -- outside Iran in production --
// fetches and edge-caches). NEXT_PUBLIC_TMDB_IMAGE_BASE can point at a
// dedicated mirror instead (e.g. a Cloudflare Worker domain), no trailing slash.
const TMDB_ORIGIN = "https://image.tmdb.org/t/p/";
//
// Local `next dev` skips the proxy and loads from TMDb directly (as before);
// set NEXT_PUBLIC_TMDB_IMAGE_BASE in .env.local to force a proxy/mirror there.
const PROXY_BASE = (
  process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || (process.env.NODE_ENV === "production" ? "/tmdb-img" : "")
).replace(/\/+$/, "");

export function proxyTmdbUrl(url: string): string {
  return PROXY_BASE && url.startsWith(TMDB_ORIGIN) ? `${PROXY_BASE}/${url.slice(TMDB_ORIGIN.length)}` : url;
}
