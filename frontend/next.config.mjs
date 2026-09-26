/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Every next/image src is a TMDb poster; the loader picks TMDb's own
    // pre-sized file per srcset width instead of going through /_next/image.
    loader: "custom",
    loaderFile: "./lib/tmdb-image-loader.ts",
  },
};
export default nextConfig;
