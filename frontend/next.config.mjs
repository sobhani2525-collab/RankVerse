// Sent on every page. The CSP only covers framing, <base>, plugins and form
// targets; scripts, styles and images stay unrestricted (Next's inline
// scripts, poster mirrors, YouTube trailers), so it can't break rendering.
// No includeSubDomains on HSTS: not every subdomain is known to serve HTTPS.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Self-contained server (.next/standalone) for the Docker image that runs on Liara.
  output: "standalone",
  images: {
    // Every next/image src is a TMDb poster; the loader picks TMDb's own
    // pre-sized file per srcset width instead of going through /_next/image.
    loader: "custom",
    loaderFile: "./lib/tmdb-image-loader.ts",
  },
  // Same-origin proxy for TMDb posters (the CDN is filtered in Iran).
  async rewrites() {
    return [{ source: "/tmdb-img/:path*", destination: "https://image.tmdb.org/t/p/:path*" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Logos are replaced by renaming, never in place.
      ...["/brand-logo.png", "/logo.png"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      })),
      {
        source: "/tmdb-img/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, s-maxage=31536000, immutable" }],
      },
    ];
  },
};
export default nextConfig;
