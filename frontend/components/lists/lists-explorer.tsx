"use client";
import { useRef, useState } from "react";
import ListTicketCard from "@/components/lists/list-ticket-card";
import { discoverLists } from "@/lib/api";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import type { ListSummary } from "@/lib/types";

export type ListSort = "newest" | "popular";
export type ListTypeFilter = "all" | "movie" | "tv_series" | "person";

const PAGE_SIZE = 30;

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "newest", label: "تازه‌ترین" },
  { value: "popular", label: "محبوب‌ترین" },
];

const TYPE_OPTIONS: { value: ListTypeFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "movie", label: "فیلم" },
  { value: "tv_series", label: "سریال" },
  { value: "person", label: "شخص" },
];

const chip = "inline-flex min-h-[44px] items-center rounded-full border px-5 text-sm transition";
const chipIdle = "border-[#232A42] text-[#8A93A6] hover:text-[#F2F0E8]";
const chipActive = "border-[#E8B34A] bg-[#E8B34A]/[.12] font-bold text-[#E8B34A]";

/** Filter bar + card grid. The server renders the default view (so the page
 *  stays ISR-cached); changing a filter or loading more fetches from the API
 *  in the browser. */
export default function ListsExplorer({ initialLists }: { initialLists: ListSummary[] }) {
  const [sort, setSort] = useState<ListSort>("newest");
  const [type, setType] = useState<ListTypeFilter>("all");
  const [lists, setLists] = useState(initialLists);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialLists.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const lastRequest = useRef<[ListSort, ListTypeFilter, number]>(["newest", "all", 1]);

  async function load(nextSort: ListSort, nextType: ListTypeFilter, nextPage: number) {
    const id = ++requestId.current;
    lastRequest.current = [nextSort, nextType, nextPage];
    setLoading(true);
    setError(false);
    try {
      const rows = await discoverLists(
        { page: nextPage, page_size: PAGE_SIZE, sort: nextSort, entity_type: nextType === "all" ? undefined : nextType },
        0,
      );
      if (id !== requestId.current) return; // a newer request superseded this one
      setLists((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setPage(nextPage);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  function pick(nextSort: ListSort, nextType: ListTypeFilter) {
    if (nextSort === sort && nextType === type) return;
    setSort(nextSort);
    setType(nextType);
    void load(nextSort, nextType, 1);
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:gap-10">
        <Group label="SORT">
          {SORT_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={sort === o.value} onClick={() => pick(o.value, type)} className={`${chip} ${sort === o.value ? chipActive : chipIdle}`}>
              {o.label}
            </button>
          ))}
        </Group>
        <Group label="TYPE">
          {TYPE_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={type === o.value} onClick={() => pick(sort, o.value)} className={`${chip} ${type === o.value ? chipActive : chipIdle}`}>
              {o.label}
            </button>
          ))}
        </Group>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-gold/30 bg-gold/5 px-6 py-4 text-center text-sm text-muted">
          دریافت فهرست‌ها ناموفق بود.{" "}
          <button type="button" className="text-gold underline" onClick={() => void load(...lastRequest.current)}>
            تلاش دوباره
          </button>
        </div>
      )}

      {lists.length === 0 && !loading && !error ? (
        <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
          {type === "all" ? "هنوز فهرستی ساخته نشده. اولین نفر باشید!" : "فهرستی با این فیلتر پیدا نشد."}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-8 transition-opacity md:grid-cols-2 lg:grid-cols-3 ${loading && page === 1 ? "opacity-50" : ""}`}>
          {lists.map((list) => (
            <ListTicketCard key={list.id} list={listSummaryToTicketCard(list)} />
          ))}
        </div>
      )}

      {hasMore && lists.length > 0 && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load(sort, type, page + 1)}
            className="min-h-[44px] rounded-full border border-[#232A42] px-8 text-sm font-bold text-[#C7CCE0] transition hover:border-[#E8B34A] hover:text-[#E8B34A] disabled:opacity-50"
          >
            {loading ? "در حال دریافت…" : "نمایش بیشتر"}
          </button>
        </div>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span dir="ltr" className="ml-1 font-mono text-[11px] uppercase tracking-[.3em] text-[#5A6380]">{label}</span>
      {children}
    </div>
  );
}
