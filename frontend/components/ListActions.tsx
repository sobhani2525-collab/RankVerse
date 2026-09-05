"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { toggleListLike, toggleListFollow, deleteList } from "@/lib/api";

export default function ListActions({
  slug,
  initialLiked,
  initialFollowing,
  initialLikeCount,
  initialFollowerCount,
  isOwner,
}: {
  slug: string;
  initialLiked: boolean;
  initialFollowing: boolean;
  initialLikeCount: number;
  initialFollowerCount: number;
  isOwner: boolean;
}) {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [following, setFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);

  async function handleLike() {
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

  async function handleFollow() {
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

  async function handleDelete() {
    if (!token) return;
    if (!confirm("این لیست برای همیشه حذف می‌شود. مطمئن هستید؟")) return;
    try {
      await deleteList(token, slug);
      router.push("/lists");
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در حذف لیست");
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="num">♥ {likeCount}</span>
        <span className="num">پیرو: {followerCount}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleLike}
        disabled={busy}
        className={`num flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
          liked
            ? "border-gold/50 bg-gold/10 text-gold"
            : "border-border text-muted hover:border-gold/40"
        }`}
      >
        ♥ {likeCount}
      </button>

      <button
        onClick={handleFollow}
        disabled={busy}
        className={`num flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
          following
            ? "border-teal/50 bg-teal/10 text-teal"
            : "border-border text-muted hover:border-teal/40"
        }`}
      >
        {following ? "دنبال می‌کنید" : "دنبال کردن"} · {followerCount}
      </button>

      {isOwner && (
        <button
          onClick={handleDelete}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:border-red-500/50 hover:text-red-400"
        >
          حذف لیست
        </button>
      )}
    </div>
  );
}