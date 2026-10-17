"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications";
import NotificationItem from "@/components/NotificationItem";

const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const DROPDOWN_SIZE = 10;

const faNumber = (n: number) => n.toLocaleString("fa-IR");

export default function NotificationBell() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Light polling of the unread count: only while the tab is visible, doubling
  // the delay after each failure. No WebSocket/SSE.
  useEffect(() => {
    if (!token) {
      setCount(0);
      return;
    }
    let timer: number | undefined;
    let delay = POLL_MS;
    let cancelled = false;

    const schedule = () => {
      window.clearTimeout(timer);
      if (cancelled || document.visibilityState !== "visible") return;
      timer = window.setTimeout(tick, delay);
    };
    const tick = async () => {
      const t = tokenRef.current;
      if (!t) return;
      try {
        const c = await fetchUnreadCount(t);
        if (cancelled) return;
        setCount(c);
        delay = POLL_MS;
      } catch {
        delay = Math.min(delay * 2, MAX_BACKOFF_MS);
      }
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
      else window.clearTimeout(timer);
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  const loadItems = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    setFailed(false);
    try {
      const page = await fetchNotifications(t, null, DROPDOWN_SIZE);
      setItems(page.items);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadItems();
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loadItems]);

  // Optimistic: update the UI first, roll back if the request fails.
  async function handleOpen(n: AppNotification) {
    setOpen(false);
    if (n.is_read || !token) return;
    setItems((cur) => cur && cur.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
    setCount((c) => Math.max(c - 1, 0));
    try {
      await markNotificationRead(token, n.id);
    } catch {
      setCount((c) => c + 1);
    }
  }

  async function handleDelete(n: AppNotification) {
    if (!token) return;
    const before = items;
    setItems((cur) => cur && cur.filter((i) => i.id !== n.id));
    if (!n.is_read) setCount((c) => Math.max(c - 1, 0));
    try {
      await deleteNotification(token, n.id);
    } catch {
      setItems(before);
      if (!n.is_read) setCount((c) => c + 1);
    }
  }

  async function handleReadAll() {
    if (!token || count === 0) return;
    const before = items;
    const prevCount = count;
    setItems((cur) => cur && cur.map((i) => ({ ...i, is_read: true })));
    setCount(0);
    try {
      await markAllNotificationsRead(token);
    } catch {
      setItems(before);
      setCount(prevCount);
    }
  }

  if (!token) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={count > 0 ? `اعلان‌ها، ${faNumber(count)} خوانده‌نشده` : "اعلان‌ها"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border text-ink transition hover:border-gold/40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -left-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold leading-none text-bg">
            {count > 99 ? `${faNumber(99)}+` : faNumber(count)}
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-bold text-ink">اعلان‌ها</span>
            <button
              type="button"
              onClick={handleReadAll}
              disabled={count === 0}
              className="text-xs text-teal transition hover:opacity-80 disabled:text-muted"
            >
              خواندن همه
            </button>
          </div>

          {failed ? (
            <div className="px-4 py-6 text-center text-sm text-muted">
              دریافت اعلان‌ها ممکن نشد.{" "}
              <button type="button" onClick={loadItems} className="text-teal">
                تلاش مجدد
              </button>
            </div>
          ) : items === null ? (
            <div className="px-4 py-6 text-center text-sm text-muted">در حال بارگذاری…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">اعلانی ندارید.</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <NotificationItem key={n.id} n={n} onOpen={handleOpen} onDelete={handleDelete} />
              ))}
            </ul>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-sm text-gold transition hover:bg-surface2"
          >
            همهٔ اعلان‌ها
          </Link>
        </div>
      )}
    </div>
  );
}
