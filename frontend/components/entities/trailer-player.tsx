"use client";

import { useState } from "react";

/**
 * YouTube trailer that only loads the player when asked: no third-party
 * iframe (and no tracking) until the visitor presses play, and a plain link
 * as a fallback for networks where embeds don't load.
 */
export default function TrailerPlayer({ youtubeKey, title }: { youtubeKey: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeKey)}`;

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface2">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeKey)}?autoplay=1&rel=0`}
            title={`تریلر ${title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`پخش تریلر ${title}`}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface2 to-bg transition hover:from-surface"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold/60 text-gold transition group-hover:scale-105 group-hover:bg-gold/10">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="text-sm text-ink-dim">پخش تریلر</span>
          </button>
        )}
      </div>
      <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-muted hover:text-gold">
        اگر پخش نشد، در یوتیوب ببینید ←
      </a>
    </div>
  );
}
