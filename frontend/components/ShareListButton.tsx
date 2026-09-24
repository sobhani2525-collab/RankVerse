"use client";
import { useState } from "react";

/**
 * Same circular icon-button look as DetailShareButton (movie/tv-series
 * detail pages), just building a /lists/{slug} url instead of resolving
 * one through detailPathFor.
 */
export default function ShareListButton({
  slug,
  title,
  size = 44,
  shape = "circle",
}: {
  slug: string;
  title: string;
  size?: number;
  /** "square" = the list hero's rounded-square action buttons. */
  shape?: "circle" | "square";
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/lists/${slug}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${title} | RankVerse`, url });
        return;
      } catch {
        // fall through to clipboard copy
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied; nothing more we can do
    }
  }

  return (
    <button
      type="button"
      aria-label="اشتراک‌گذاری"
      onClick={handleShare}
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center border border-border transition hover:border-teal/40 hover:text-teal ${
        shape === "square" ? "rounded-xl bg-surface text-ink" : "rounded-full bg-surface/60 text-muted"
      }`}
    >
      <svg
        width={size * 0.4}
        height={size * 0.4}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
        <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
      </svg>

      {copied && (
        <span className="absolute -bottom-7 right-1/2 translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface2 px-2 py-1 text-[10px] text-teal shadow">
          لینک کپی شد
        </span>
      )}
    </button>
  );
}
