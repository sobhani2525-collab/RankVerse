"use client";
import { useEffect, useRef, useState } from "react";
import ClientPager from "@/components/ClientPager";
import { LoadingArea } from "@/components/NavTransition";
import ListTicketCard from "@/components/lists/list-ticket-card";
import { discoverListsPage, LISTS_PAGE_SIZE } from "@/lib/api";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import type { ListSummary } from "@/lib/types";

export type ListSort = "newest" | "popular";
export type ListTypeFilter = "all" | "movie" | "tv_series" | "person";

/** Pages for a total; without one, offer one more page while this one came back full. */
function pagesFor(total: number | null, page: number, rows: number): number {
  if (total !== null) return Math.max(1, Math.ceil(total / LISTS_PAGE_SIZE));
  return rows === LISTS_PAGE_SIZE ? page + 1 : page;
}

const SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "newest", label: "تازه‌ترین" },
  { value: "popular", label: "محبوب‌ترین" },
];

const TYPE_OPTIONS: { value: ListTypeFilter; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "movie", label: "فیلم" },
  { value: "tv_series", label: "سریال" },
  { value: "person", label: "هنرمند" },
];

// Same bar as the battles hub: type chips on one side, sort chips on the other.
const chip = "rounded-xl border px-4 py-1.5 text-sm transition";
const chipIdle = "border-transparent text-muted hover:text-ink";
const chipActive = "border-gold bg-gold/10 text-gold";

/** Filter bar + card grid. The server renders the default view (so the page
 *  stays ISR-cached); changing a filter or loading more fetches from the API
 *  in the browser. */
export default function ListsExplorer({ initialLists, initialTotal }: { initialLists: ListSummary[]; initialTotal: number | null }) {
  const [sort, setSort] = useState<ListSort>("newest");
  const [type, setType] = useState<ListTypeFilter>("all");
  const [query, setQuery] = useState("");
  const [lists, setLists] = useState(initialLists);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(() => pagesFor(initialTotal, 1, initialLists.length));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const lastRequest = useRef<[ListSort, ListTypeFilter, number, string]>(["newest", "all", 1, ""]);
  const gridTop = useRef<HTMLDivElement>(null);

  async function load(nextSort: ListSort, nextType: ListTypeFilter, nextPage: number, nextQuery: string = query.trim()) {
    const id = ++requestId.current;
    lastRequest.current = [nextSort, nextType, nextPage, nextQuery];
    setLoading(true);
    setError(false);
    try {
      const { items: rows, total } = await discoverListsPage(
        {
          page: nextPage,
          page_size: LISTS_PAGE_SIZE,
          sort: nextSort,
          entity_type: nextType === "all" ? undefined : nextType,
          q: nextQuery || undefined,
        },
        0,
      );
      if (id !== requestId.current) return; // a newer request superseded this one
      setLists(rows);
      setPage(nextPage);
      setTotalPages(pagesFor(total, nextPage, rows.length));
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  // Search as the visitor types, after a short pause. The first run (empty
  // query, nothing typed yet) keeps the server-rendered list.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) return;
    const t = setTimeout(() => void load(sort, type, 1, query.trim()), 350);
    return () => clearTimeout(t);
    // load/sort/type are read at fire time; only a new query should re-arm the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function pick(nextSort: ListSort, nextType: ListTypeFilter) {
    if (nextSort === sort && nextType === type) return;
    setSort(nextSort);
    setType(nextType);
    void load(nextSort, nextType, 1);
  }

  return (
    <>
      <div className="mb-6">
        <label htmlFor="lists-search" className="sr-only">
          جستجوی فهرست‌ها
        </label>
        <input
          id="lists-search"
          type="search"
          value={query}
          onChange={(e) => {
            typed.current = true;
            setQuery(e.target.value);
          }}
          maxLength={80}
          placeholder="جستجوی فهرست‌ها: عنوان یا توضیح…"
          className="w-full max-w-md rounded-2xl border border-[#232A42] bg-[#0B0F1A] px-5 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-gold/50 focus:outline-none"
        />
      </div>

      <div ref={gridTop} className="mb-8 flex scroll-mt-24 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-2">
        <div className="flex flex-wrap gap-1">
          {TYPE_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={type === o.value} onClick={() => pick(sort, o.value)} className={`${chip} ${type === o.value ? chipActive : chipIdle}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {SORT_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={sort === o.value} onClick={() => pick(o.value, type)} className={`${chip} ${sort === o.value ? chipActive : chipIdle}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-gold/30 bg-gold/5 px-6 py-4 text-center text-sm text-muted">
          دریافت فهرست‌ها ناموفق بود.{" "}
          <button type="button" className="text-gold underline" onClick={() => void load(...lastRequest.current)}>
            تلاش دوباره
          </button>
        </div>
      )}

      <LoadingArea loading={loading}>
        {lists.length === 0 && !loading && !error ? (
          <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
            {type === "all" && !query.trim() ? "هنوز فهرستی ساخته نشده. اولین نفر باشید!" : "فهرستی با این جستجو یا فیلتر پیدا نشد."}
          </div>
        ) : (
          <div className="grid min-h-[8rem] grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <ListTicketCard key={list.id} list={listSummaryToTicketCard(list)} />
            ))}
          </div>
        )}
      </LoadingArea>

      <ClientPager
        page={page}
        totalPages={totalPages}
        disabled={loading}
        onPage={(p) => {
          void load(sort, type, p);
          gridTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
    </>
  );
}
