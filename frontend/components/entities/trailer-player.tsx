"use client";

import { useState } from "react";

/**
 * YouTube trailer that only loads the player when asked: the poster is the
 * video's own thumbnail (a plain image, no player/scripts) and the iframe
 * only mounts when the visitor presses play, plus a plain link
 * as a fallback for networks where embeds don't load.
 */
export default function TrailerPlayer({ youtubeKey, title }: { youtubeKey: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  // maxresdefault is sharpest but missing for some videos; hqdefault always exists.
  const [thumb, setThumb] = useState<"maxresdefault" | "hqdefault" | null>("maxresdefault");
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`;

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface2">
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeKey)}?autoplay=1&rel=0`}
            title={`تریلر ${title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`پخش تریلر ${title}`}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface2 to-bg transition hover:from-surface"
          >
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://i.ytimg.com/vi/${encodeURIComponent(youtubeKey)}/${thumb}.jpg`}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={(e) => {
                  // YouTube serves a 120px placeholder with 200 OK when maxres doesn't exist.
                  if (e.currentTarget.naturalWidth <= 120) setThumb(thumb === "maxresdefault" ? "hqdefault" : null);
                }}
                onError={() => setThumb(thumb === "maxresdefault" ? "hqdefault" : null)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/15" aria-hidden="true" />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold/60 bg-black/50 text-gold transition group-hover:scale-105 group-hover:bg-black/70">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="relative text-sm text-white drop-shadow">پخش تریلر</span>
          </button>
        )}
      </div>
      <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-muted hover:text-gold">
        اگر پخش نشد، در یوتیوب ببینید ←
      </a>
    </div>
  );
}
