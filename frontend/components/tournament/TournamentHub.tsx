"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import SectionHeading from "@/components/home/SectionHeading";
import { ENTITY_TYPE_LABELS, TournamentSummary, tournamentApi } from "@/lib/tournament";
import TournamentCard from "./TournamentCard";
import ClientPager from "@/components/ClientPager";

const PAGE_SIZE = 6;

const SORTS = [
  { value: "newest", label: "جدیدترین" },
  { value: "popular", label: "پررأی‌ترین" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-1.5 text-sm transition ${
        active ? "border-gold bg-gold/10 text-gold" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** /battles: public user-made pool battles with filters, plus the way in to build one. */
export default function TournamentHub() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [entityType, setEntityType] = useState("");
  const [sort, setSort] = useState("newest");
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // the admin-curated strip on top, like the featured lists
  const [featured, setFeatured] = useState<TournamentSummary[]>([]);
  const gridTop = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const { items: rows, total } = await tournamentApi.listPage(getToken(), { page: nextPage, page_size: PAGE_SIZE, entity_type: entityType, sort });
        setItems(rows);
        setPage(nextPage);
        // without a total, offer one more page while this one came back full
        setTotalPages(total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : rows.length === PAGE_SIZE ? nextPage + 1 : nextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطا در دریافت نبردها");
      } finally {
        setLoading(false);
      }
    },
    [getToken, entityType, sort]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  function goTo(nextPage: number) {
    void load(nextPage);
    gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    tournamentApi
      .featured(getToken())
      .then(setFeatured)
      .catch(() => setFeatured([]));
  }, [getToken]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading
        kicker="Winner stays"
        title="آوردگاه نبردها"
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
          </div>
        }
      />

      {featured.length > 0 && (
        <section className="mb-12" aria-labelledby="featured-battles-heading">
          <h2 id="featured-battles-heading" className="mb-4 flex items-center gap-2 text-lg font-extrabold text-ink">
            <span className="text-gold" aria-hidden="true">★</span>
            نبردهای برگزیده
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 3).map((b) => (
              <TournamentCard key={b.slug} battle={b} />
            ))}
          </div>
        </section>
      )}

      <div ref={gridTop} className="mb-8 flex scroll-mt-24 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-2">
        <div className="flex flex-wrap gap-1">
          <Chip active={entityType === ""} onClick={() => setEntityType("")}>
            همه
          </Chip>
          {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
            <Chip key={value} active={entityType === value} onClick={() => setEntityType(value)}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-1">
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
      <div className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-50" : ""}`}>
        {items.map((b) => (
          <TournamentCard key={b.slug} battle={b} />
        ))}
      </div>
      {loading && items.length === 0 && <p className="mt-6 text-center text-sm text-muted">در حال بارگذاری…</p>}
      <ClientPager page={page} totalPages={totalPages} onPage={goTo} disabled={loading} />
    </main>
  );
}
