"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { getWatchedEntityIds, toggleWatched } from "@/lib/api";
import { RATING_NUDGE_EVENT } from "@/components/rating/StarRating";
import { GLASS } from "@/components/list-detail/ui";

/**
 * "تماشا کرده‌ام" -- persists a watched mark. Marking (not un-marking) also
 * nudges the 5-star widget, which lights its stars one by one if the user
 * hasn't rated this title yet.
 */
export default function WatchedButton({ entityId, slug }: { entityId: string; slug: string }) {
  const { token, getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setWatched(false);
      return;
    }
    getWatchedEntityIds(token)
      .then((ids) => setWatched(ids.includes(entityId)))
      .catch(() => {});
  }, [token, entityId]);

  async function doToggle() {
    const authToken = getToken();
    if (!authToken || busy) return;
    const was = watched;
    setWatched(!was); // optimistic
    setBusy(true);
    try {
      const res = await toggleWatched(authToken, entityId);
      setWatched(res.watched);
      if (res.watched) window.dispatchEvent(new CustomEvent(RATING_NUDGE_EVENT, { detail: { slug } }));
    } catch {
      setWatched(was); // rollback
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-pressed={watched}
      disabled={busy}
      onClick={() => requireAuth(doToggle)}
      className={`flex h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold transition ${
        watched
          ? "border-gold/60 bg-gold/15 text-gold"
          : `${GLASS} text-ink hover:border-gold/50 hover:bg-[#0A0F18]/75`
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {watched ? "تماشا کرده‌ام ✓" : "تماشا کرده‌ام"}
    </button>
  );
}
