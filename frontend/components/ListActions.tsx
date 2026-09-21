"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toggleListLike, toggleListFollow } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";

export default function ListActions({
  slug,
  initialLiked,
  initialFollowing,
  initialLikeCount,
  initialFollowerCount,
}: {
  slug: string;
  initialLiked: boolean;
  initialFollowing: boolean;
  initialLikeCount: number;
  initialFollowerCount: number;
}) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
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
    <div className="flex items-center gap-3">
      <button
        onClick={() => requireAuth(doLike)}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
          liked
            ? "border-gold/50 bg-gold/10 text-gold"
            : "border-border text-muted hover:border-gold/40"
        }`}
      >
        ♥ <span className="num">{toFaDigits(likeCount)}</span>
      </button>

      <button
        onClick={() => requireAuth(doFollow)}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
          following
            ? "border-teal/50 bg-teal/10 text-teal"
            : "border-border text-muted hover:border-teal/40"
        }`}
      >
        {following ? "دنبال می‌کنید" : "دنبال کردن"} · <span className="num">{toFaDigits(followerCount)}</span>
      </button>
    </div>
  );
}
