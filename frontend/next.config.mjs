/** @type {import('next').NextConfig} */
const nextConfig = {
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
