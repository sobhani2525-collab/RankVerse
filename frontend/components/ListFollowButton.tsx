"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toggleListFollow } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";

/**
 * Same circular icon-button footprint as ListLikeButton/ShareListButton, so
 * follow sits alongside like/share instead of as a separate labeled pill.
 * Uses a person+ / person-check glyph (no movie/tv-series equivalent to
 * mirror, since favoriting has no "follow" concept there).
 */
export default function ListFollowButton({
  slug,
  initialFollowing,
  initialFollowerCount,
  size = 44,
}: {
  slug: string;
  initialFollowing: boolean;
  initialFollowerCount: number;
  size?: number;
}) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);

  async function doFollow() {
    const token = getToken();
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await toggleListFollow(token, slug);
      setFollowing(res.following);
      setFollowerCount((c) => c + (res.following ? 1 : -1));
    } catch {
      // silently ignore
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={following ? "لغو دنبال کردن" : "دنبال کردن"}
      aria-pressed={following}
      title={following ? "دنبال می‌کنید" : "دنبال کردن"}
      onClick={() => requireAuth(doFollow)}
      disabled={busy}
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center rounded-full border bg-surface/60 transition disabled:opacity-50 ${
        following ? "border-teal/50 text-teal" : "border-border text-muted hover:border-teal/40"
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
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        {following ? (
          <polyline points="16 11 18 13 22 9" />
        ) : (
          <>
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="16" y1="11" x2="22" y2="11" />
          </>
        )}
      </svg>

      {followerCount > 0 && (
        <span
          className={`num absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border px-1.5 py-px text-[10px] font-bold leading-tight ${
            following ? "border-teal/50 bg-teal text-bg" : "border-border bg-surface2 text-muted"
          }`}
        >
          {toFaDigits(followerCount)}
        </span>
      )}
    </button>
  );
}
