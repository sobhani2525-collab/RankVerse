"use client";

import { useEffect } from "react";

const PRIMARY = (process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || "").replace(/\/+$/, "");
const FALLBACK = (process.env.NEXT_PUBLIC_TMDB_IMAGE_FALLBACK_BASE || "").replace(/\/+$/, "");

/**
 * Posters come from our own /tmdb-img route (see .env.production). When one
 * fails to load from it, retry once from the fallback (the Cloudflare mirror).
 * <img> error events don't bubble, so listen in the capture phase.
 */
export default function TmdbImageFallback() {
  useEffect(() => {
    if (!PRIMARY || !FALLBACK) return;
    const swap = (src: string) => (src.startsWith(`${PRIMARY}/`) ? FALLBACK + src.slice(PRIMARY.length) : src);
    const onError = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.tmdbRetried) return;
      const src = img.currentSrc || img.src;
      if (!src.startsWith(`${PRIMARY}/`)) return;
      img.dataset.tmdbRetried = "1";
      // Rewrite srcset too: next/image sets it, and it wins over src.
      if (img.srcset) {
        img.srcset = img.srcset
          .split(",")
          .map((part) => swap(part.trim()))
          .join(", ");
      }
      img.src = swap(src);
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
