/** @type {import('next').NextConfig} */
const nextConfig = {
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
      {
        source: "/tmdb-img/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, s-maxage=31536000, immutable" }],
      },
    ];
  },
};
export default nextConfig;
