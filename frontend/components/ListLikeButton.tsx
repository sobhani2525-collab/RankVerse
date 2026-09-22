"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toggleListLike } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";

/**
 * The list-like counterpart to DetailFavoriteButton (movie/tv-series detail
 * pages) -- same circular heart button, sized to sit next to
 * ShareListButton, with the like count as a small corner badge since
 * (unlike favoriting) a list like is a shared, counted signal.
 */
export default function ListLikeButton({
  slug,
  initialLiked,
  initialLikeCount,
  size = 44,
}: {
  slug: string;
  initialLiked: boolean;
  initialLikeCount: number;
  size?: number;
}) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [busy, setBusy] = useState(false);

  async function doLike() {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await toggleListLike(token, slug);
      setLiked(res.liked);
      setLikeCount((c) => c + (res.liked ? 1 : -1));
    } catch {
      // silently ignore; UI stays consistent with last known state
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={liked ? "لغو لایک" : "لایک"}
      aria-pressed={liked}
      onClick={() => requireAuth(doLike)}
      disabled={busy}
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center rounded-full border bg-surface/60 transition disabled:opacity-50 ${
        liked ? "border-gold/50 text-gold" : "border-border text-muted hover:border-gold/40"
      }`}
    >
      <svg
        width={size * 0.4}
        height={size * 0.4}
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>

      {likeCount > 0 && (
        <span
          className={`num absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border px-1.5 py-px text-[10px] font-bold leading-tight ${
            liked ? "border-gold/50 bg-gold text-bg" : "border-border bg-surface2 text-muted"
          }`}
        >
          {toFaDigits(likeCount)}
        </span>
      )}
    </button>
  );
}
