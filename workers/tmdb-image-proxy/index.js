// Cloudflare Worker: a read-only mirror of TMDb's image CDN (image.tmdb.org).
//
// TMDb is unreachable from Iranian hosts (including the Liara app that serves
// the site), and proxying every poster through the Next.js server is too heavy
// for a small plan. Browsers load posters from this Worker's domain instead
// (frontend: NEXT_PUBLIC_TMDB_IMAGE_BASE=https://img.cinemagozin.ir), and
// Cloudflare caches each image at the edge for a year, so the Worker itself
// only runs on cache misses' fetch; its CPU use is negligible.
//
// It is NOT an open proxy: only TMDb image paths (/w500/abc.jpg, /h632/abc.jpg,
// /original/abc.jpg) are served, GET/HEAD only.
const ORIGIN = "https://image.tmdb.org/t/p";
const IMAGE_PATH = /^\/(?:w\d{2,4}|h\d{2,4}|original)\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;
const YEAR = 31536000;

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const { pathname } = new URL(request.url);
    if (!IMAGE_PATH.test(pathname)) {
      return new Response("Not found", { status: 404 });
    }

    const upstream = await fetch(`${ORIGIN}${pathname}`, {
      method: request.method,
      cf: {
        cacheEverything: true,
        // Images are immutable per path; errors are cached briefly or not at all.
        cacheTtlByStatus: { "200-299": YEAR, 404: 60, "500-599": 0 },
      },
    });

    if (!upstream.ok) {
      return new Response(upstream.status === 404 ? "Not found" : "Upstream error", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "public, max-age=60" },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": `public, max-age=${YEAR}, immutable`,
        // The share-card canvas draws these images and needs CORS to export them.
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
