"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { TournamentSummary, tournamentApi } from "@/lib/tournament";
import TournamentCard from "./TournamentCard";

const PAGE_SIZE = 12;
const TABS = [
  { value: "draft", label: "پیش‌نویس" },
  { value: "active", label: "منتشرشده" },
  { value: "following", label: "دنبال‌شده‌ها" },
];

/** "نبردهای من": the creator's drafts / running / finished battles plus the ones they follow. */
export default function MyBattles() {
  const { getToken, isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const [tab, setTab] = useState("active");
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      const token = getToken();
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const rows = await tournamentApi.mine(token, { tab, page: nextPage });
        setItems((prev) => (replace ? rows : [...prev, ...rows]));
        setPage(nextPage);
        setHasMore(rows.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطا در دریافت نبردها");
      } finally {
        setLoading(false);
      }
    },
    [getToken, tab]
  );

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      openLoginModal();
      return;
    }
    load(1, true);
  }, [authLoading, isAuthenticated, load, openLoginModal]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">نبردهای من</h1>
        <Link href="/battles/new" className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-bg">
          ساخت نبرد جدید
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === t.value ? "border-gold bg-gold/10 text-gold" : "border-border text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isAuthenticated && !authLoading && <p className="mt-8 text-center text-muted">برای دیدن نبردهایت وارد شو.</p>}
      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {isAuthenticated && !loading && !error && items.length === 0 && (
        <p className="mt-8 rounded-2xl border border-border bg-surface p-10 text-center text-muted">
          {tab === "following" ? "هنوز نبردی را دنبال نکرده‌ای." : "اینجا چیزی نیست."}
        </p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((b) =>
          b.status === "draft" ? (
            <div key={b.slug} className="flex flex-col gap-2">
              <TournamentCard battle={b} />
              <Link href={`/battles/new?slug=${b.slug}`} className="text-center text-sm text-gold hover:underline">
                ادامهٔ ویرایش
              </Link>
            </div>
          ) : (
            <TournamentCard key={b.slug} battle={b} />
          )
        )}
      </div>
      {loading && <p className="mt-6 text-center text-sm text-muted">در حال بارگذاری…</p>}
      {hasMore && !loading && (
        <div className="mt-8 text-center">
          <button type="button" onClick={() => load(page + 1, false)} className="rounded-xl border border-border px-6 py-2.5 text-sm text-ink-dim hover:text-ink">
            نمایش بیشتر
          </button>
        </div>
      )}
    </main>
  );
}
