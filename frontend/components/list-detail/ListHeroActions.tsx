"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { toggleListFollow, toggleListLike } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import ShareListButton from "@/components/ShareListButton";
import ListEditPanel from "@/components/ListEditPanel";
import { useListViewer } from "./ListViewerContext";
import { HeartIcon } from "./icons";

/**
 * Follow (primary), like (with count) and share, plus the owner's edit
 * toggle. Follow/like flip immediately and roll back if the request fails;
 * the server's answer wins if it disagrees.
 */
export default function ListHeroActions() {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const { slug, detail, liked, likeCount, following, followerCount, setLike, setFollow, refresh } =
    useListViewer();
  const [busy, setBusy] = useState<"like" | "follow" | null>(null);
  const [editing, setEditing] = useState(false);

  async function doFollow() {
    const token = getToken();
    if (!token || busy) return;
    const prev = { following, followerCount };
    const next = !prev.following;
    setFollow(next, prev.followerCount + (next ? 1 : -1));
    setBusy("follow");
    try {
      const res = await toggleListFollow(token, slug);
      setFollow(res.following, prev.followerCount + Number(res.following) - Number(prev.following));
    } catch {
      setFollow(prev.following, prev.followerCount);
    } finally {
      setBusy(null);
    }
  }

  async function doLike() {
    const token = getToken();
    if (!token || busy) return;
    const prev = { liked, likeCount };
    const next = !prev.liked;
    setLike(next, prev.likeCount + (next ? 1 : -1));
    setBusy("like");
    try {
      const res = await toggleListLike(token, slug);
      setLike(res.liked, prev.likeCount + Number(res.liked) - Number(prev.liked));
    } catch {
      setLike(prev.liked, prev.likeCount);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mt-2 flex flex-wrap gap-2 lg:gap-3">
        <button
          type="button"
          onClick={() => requireAuth(doFollow)}
          aria-pressed={following}
          className={`h-12 flex-1 rounded-xl px-[26px] text-[15px] font-extrabold transition lg:flex-none ${
            following
              ? "border border-teal/50 bg-teal/10 text-teal"
              : "bg-ink text-bg hover:bg-ink/90"
          }`}
        >
          {following ? "دنبال می‌کنید" : "دنبال کردن لیست"}
        </button>

        <button
          type="button"
          onClick={() => requireAuth(doLike)}
          aria-pressed={liked}
          aria-label={liked ? "لغو پسندیدن لیست" : "پسندیدن لیست"}
          className={`num flex h-12 items-center gap-2.5 rounded-xl border px-4 text-sm font-bold transition-[background-color,border-color,color] duration-[160ms] lg:px-5 ${
            liked
              ? "border-gold bg-gold/[0.14] text-gold"
              : "border-[#2A3247] bg-transparent text-[#C9CFDC] hover:border-[#3A4560]"
          }`}
        >
          <HeartIcon fill={liked ? "rgba(232,179,74,0.35)" : "none"} />
          {toFaDigits(likeCount)}
        </button>

        <ShareListButton slug={slug} title={detail.title} size={48} shape="square" />

        {detail.is_owner && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="h-12 rounded-xl border border-border bg-surface px-4 text-sm text-muted transition hover:border-gold/40 hover:text-gold"
          >
            {editing ? "بستن ویرایش" : "ویرایش لیست"}
          </button>
        )}
      </div>

      {detail.is_owner && editing && (
        <ListEditPanel
          slug={slug}
          detail={detail}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
