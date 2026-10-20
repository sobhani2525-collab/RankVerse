"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import SectionHeading from "@/components/home/SectionHeading";
import { ENTITY_TYPE_LABELS, TournamentSummary, tournamentApi } from "@/lib/tournament";
import TournamentCard from "./TournamentCard";

const PAGE_SIZE = 12;

const STATUS_TABS = [
  { value: "", label: "همه" },
  { value: "active", label: "در جریان" },
  { value: "completed", label: "پایان‌یافته" },
];
const SORTS = [
  { value: "newest", label: "جدیدترین" },
  { value: "popular", label: "پررأی‌ترین" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** /battles: public tournament brackets with filters, plus the way in to build one. */
export default function TournamentHub() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [status, setStatus] = useState("active");
  const [entityType, setEntityType] = useState("");
  const [sort, setSort] = useState("newest");
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const rows = await tournamentApi.list(getToken(), { page: nextPage, status, entity_type: entityType, sort });
        setItems((prev) => (replace ? rows : [...prev, ...rows]));
        setPage(nextPage);
        setHasMore(rows.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطا در دریافت نبردها");
      } finally {
        setLoading(false);
      }
    },
    [getToken, status, entityType, sort]
  );

  useEffect(() => {
    load(1, true);
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading
        kicker="Tournament battles"
        title="نبردهای تورنمنتی"
        lead="کاربران برکت می‌سازند و همه رأی می‌دهند؛ دور به دور حذف می‌شوند تا قهرمان مشخص شود."
        action={
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => requireAuth(() => router.push("/battles/new"))}
              className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-bg transition hover:opacity-90"
            >
              ساخت نبرد جدید
            </button>
            <button
              type="button"
              onClick={() => requireAuth(() => router.push("/battles/mine"))}
              className="rounded-xl border border-border px-5 py-2.5 text-sm text-ink-dim hover:text-ink"
            >
              نبردهای من
            </button>
            <Link href="/battles?mode=quick" className="rounded-xl border border-border px-5 py-2.5 text-sm text-ink-dim hover:text-ink">
              نبرد سریع
            </Link>
          </div>
        }
      />

      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => (
            <Chip key={t.value} active={status === t.value} onClick={() => setStatus(t.value)}>
              {t.label}
            </Chip>
          ))}
          <span className="mx-1 h-8 w-px bg-border" aria-hidden />
          <Chip active={entityType === ""} onClick={() => setEntityType("")}>
            همه نوع‌ها
          </Chip>
          {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
            <Chip key={value} active={entityType === value} onClick={() => setEntityType(value)}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          {SORTS.map((s) => (
            <Chip key={s.value} active={sort === s.value} onClick={() => setSort(s.value)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface p-10 text-center text-muted">
          هنوز نبردی با این فیلتر نیست. اولین نبرد را خودت بساز!
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((b) => (
          <TournamentCard key={b.slug} battle={b} />
        ))}
      </div>
      {loading && <p className="mt-6 text-center text-sm text-muted">در حال بارگذاری…</p>}
      {hasMore && !loading && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => load(page + 1, false)}
            className="rounded-xl border border-border px-6 py-2.5 text-sm text-ink-dim hover:text-ink"
          >
            نمایش بیشتر
          </button>
        </div>
      )}
    </main>
  );
}
