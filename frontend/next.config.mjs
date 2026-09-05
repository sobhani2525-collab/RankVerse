/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
    unoptimized: process.env.NODE_ENV === "development",
  },
};
export default nextConfig;