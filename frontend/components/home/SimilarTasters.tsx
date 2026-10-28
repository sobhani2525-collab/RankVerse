"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { SimilarUser, getSimilarUsers, toggleUserFollow } from "@/lib/api";
import { avatarByKey } from "@/lib/avatars";
import { toFaDigits } from "@/lib/format-number";
import { withFollowing } from "@/lib/follow-toggle";

/** «هم‌سلیقه‌های تو»: a slim strip of people who rate like you; the badge on an avatar toggles following. */
export default function SimilarTasters() {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const [users, setUsers] = useState<SimilarUser[] | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    getSimilarUsers(token)
      .then((u) => !cancelled && setUsers(u))
      .catch(() => !cancelled && setUsers([]));
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, getToken]);

  async function toggle(user: SimilarUser) {
    const token = getToken();
    if (!token) return;
    const next = !user.following;
    setUsers((list) => (list ? withFollowing(list, user.id, next) : list)); // optimistic
    try {
      const res = await toggleUserFollow(token, user.id);
      setUsers((list) => (list ? withFollowing(list, user.id, res.following) : list));
    } catch {
      setUsers((list) => (list ? withFollowing(list, user.id, !next) : list));
    }
  }

  if (!isAuthenticated || !users || users.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 pb-10" aria-label="هم‌سلیقه‌های تو">
      <h3 className="mb-3 text-sm font-bold text-ink">هم‌سلیقه‌های تو</h3>
      <ul className="flex snap-x gap-5 overflow-x-auto pb-2">
        {users.map((u) => {
          const av = avatarByKey(u.avatar_key);
          return (
            <li key={u.id} className="flex w-20 shrink-0 snap-start flex-col items-center text-center">
              <div className="relative">
                <Link
                  href={`/profile/${u.username}`}
                  aria-label={`پروفایل ${u.username}`}
                  className="flex h-14 w-14 items-center justify-center rounded-full text-xl"
                  style={{ background: av ? `linear-gradient(135deg, ${av.from}, ${av.to})` : "#2a2f5c" }}
                >
                  {av ? av.glyph : u.username.charAt(0).toUpperCase()}
                </Link>
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  aria-pressed={u.following}
                  aria-label={u.following ? `لغو دنبال‌کردن ${u.username}` : `دنبال‌کردن ${u.username}`}
                  className={`absolute -bottom-1 -end-1 flex h-7 w-7 items-center justify-center rounded-full border border-bg text-sm font-bold focus-visible:outline-gold ${
                    u.following ? "bg-teal text-bg" : "bg-violet-soft text-bg"
                  }`}
                >
                  {u.following ? "✓" : "+"}
                </button>
              </div>
              <span dir="ltr" className="mt-2 w-full truncate text-xs text-ink">{u.username}</span>
              <span className="num text-[11px] text-muted">{toFaDigits(u.match_percent)}٪ هم‌سلیقه</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
