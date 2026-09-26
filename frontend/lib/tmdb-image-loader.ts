// next/image loader (wired up in next.config.mjs). On Cloudflare Workers the
// default /_next/image route can't resize without an IMAGES binding: it just
// proxies the original through the Worker (~0.6s each, no Cache-Control), so
// a 32px avatar downloaded the full w500 poster. TMDb's CDN already serves
// every poster at fixed widths, so each srcset entry points straight at the
// smallest one that covers it -- cached for a year by TMDb's headers. The
// size in the src itself (e.g. w500) stays the ceiling: callers chose it as
// the largest worth sending, and TMDb's "original" can be 500KB+.
const TMDB_SIZE = /^https:\/\/image\.tmdb\.org\/t\/p\/([^/]+)\//;
const TMDB_WIDTHS = [92, 154, 185, 342, 500, 780, 1280];

export default function tmdbImageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  const match = TMDB_SIZE.exec(src);
  if (!match) {
    // Local /public files: served as-is (the param only keeps Next's
    // "loader ignores width" dev warning quiet).
    return src.startsWith("/") ? `${src}?w=${width}` : src;
  }
  const ceiling = /^w\d+$/.test(match[1]) ? Number(match[1].slice(1)) : Infinity;
  const fit = TMDB_WIDTHS.find((w) => w >= width) ?? Infinity;
  const size = fit >= ceiling ? match[1] : `w${fit}`;
  return src.replace(TMDB_SIZE, `https://image.tmdb.org/t/p/${size}/`);
}
