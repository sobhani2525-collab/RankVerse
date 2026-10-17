"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import {
  NOTIFICATION_TYPE_LABELS,
  deleteNotification,
  fetchNotificationPreferences,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  type AppNotification,
} from "@/lib/notifications";
import NotificationItem from "@/components/NotificationItem";

const PAGE_SIZE = 20;

export default function NotificationsView() {
  const { token, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (!token || busy.current || done) return;
    busy.current = true;
    setLoading(true);
    setError(false);
    try {
      const page = await fetchNotifications(token, cursor, PAGE_SIZE);
      setItems((cur) => [...cur, ...page.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setCursor(page.next_cursor);
      if (!page.next_cursor) setDone(true);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [token, cursor, done]);

  useEffect(() => {
    if (token && items.length === 0 && !done && !error) loadMore();
  }, [token, items.length, done, error, loadMore]);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || error || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), {
      rootMargin: "300px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, done, error, items.length]);

  useEffect(() => {
    if (showPrefs && token && !prefs) fetchNotificationPreferences(token).then(setPrefs).catch(() => {});
  }, [showPrefs, token, prefs]);

  async function handleOpen(n: AppNotification) {
    if (n.is_read || !token) return;
    setItems((cur) => cur.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
    try {
      await markNotificationRead(token, n.id);
    } catch {
      setItems((cur) => cur.map((i) => (i.id === n.id ? { ...i, is_read: false } : i)));
    }
  }

  async function handleDelete(n: AppNotification) {
    if (!token) return;
    const before = items;
    setItems((cur) => cur.filter((i) => i.id !== n.id));
    try {
      await deleteNotification(token, n.id);
    } catch {
      setItems(before);
    }
  }

  async function handleReadAll() {
    if (!token) return;
    const before = items;
    setItems((cur) => cur.map((i) => ({ ...i, is_read: true })));
    try {
      await markAllNotificationsRead(token);
    } catch {
      setItems(before);
    }
  }

  async function togglePref(type: string) {
    if (!token || !prefs) return;
    const next = !prefs[type];
    setPrefs({ ...prefs, [type]: next });
    try {
      setPrefs(await updateNotificationPreferences(token, { [type]: next }));
    } catch {
      setPrefs((p) => (p ? { ...p, [type]: !next } : p));
    }
  }

  if (!authLoading && !token) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted">برای دیدن اعلان‌ها وارد شوید.</p>
        <button onClick={openLoginModal} className="btn-primary mt-4 text-sm">
          ورود / ثبت‌نام
        </button>
      </main>
    );
  }

  const hasUnread = items.some((i) => !i.is_read);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8" dir="rtl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">اعلان‌ها</h1>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => setShowPrefs((s) => !s)} className="text-muted transition hover:text-teal">
            تنظیمات
          </button>
          <button onClick={handleReadAll} disabled={!hasUnread} className="text-teal transition hover:opacity-80 disabled:text-muted">
            خواندن همه
          </button>
        </div>
      </div>

      {showPrefs && (
        <section aria-label="تنظیمات اعلان‌ها" className="mb-4 rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 text-sm text-muted">دربارهٔ کدام رویدادها خبر بگیرم؟</p>
          {prefs ? (
            <ul className="flex flex-col gap-2">
              {Object.entries(NOTIFICATION_TYPE_LABELS).map(([type, label]) => (
                <li key={type}>
                  <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={prefs[type] ?? true}
                      onChange={() => togglePref(type)}
                      className="h-4 w-4 accent-gold"
                    />
                    {label}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">در حال بارگذاری…</p>
          )}
        </section>
      )}

      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {items.map((n) => (
          <NotificationItem key={n.id} n={n} onOpen={handleOpen} onDelete={handleDelete} />
        ))}
      </ul>

      {!loading && !error && done && items.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">هنوز اعلانی ندارید.</p>
      )}
      {loading && <p className="py-6 text-center text-sm text-muted">در حال بارگذاری…</p>}
      {error && (
        <p className="py-6 text-center text-sm text-muted">
          دریافت اعلان‌ها ممکن نشد.{" "}
          <button
            onClick={() => {
              setError(false);
              loadMore();
            }}
            className="text-teal"
          >
            تلاش مجدد
          </button>
        </p>
      )}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
    </main>
  );
}
