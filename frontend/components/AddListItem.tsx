"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { searchEntities, SearchResult } from "@/lib/api";
import { displayTitle } from "@/lib/title";
import { typeLabel } from "@/lib/list-constellation";
import { toFaDigits } from "@/lib/format-number";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { MonoLabel } from "@/components/list-detail/ui";
import { PlusIcon, CloseIcon, SearchIcon } from "@/components/list-detail/icons";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The "add item" node for a list still being composed (NewListForm) --
 * styled and behaved like the real list detail page's AddItemNode (closed
 * dashed "+" row, opening into a search card), but searching across every
 * entity type at once since a list is no longer locked to one category.
 */
export default function AddListItem({
  nextRank,
  onSelect,
  selectedIds,
}: {
  /** 1-based position this item would take -- shown as "افزودن آیتم #N". */
  nextRank: number;
  onSelect: (result: SearchResult) => void;
  /** Ids already picked, filtered out of results so they can't be re-added. */
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      rootRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debouncedQuery) {
      setResults(null);
      return;
    }
    let cancelled = false;
    searchEntities(debouncedQuery)
      .then((items) => {
        if (!cancelled) setResults(items);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery]);

  function close() {
    setQuery("");
    setResults(null);
    setOpen(false);
  }

  function handleSelect(result: SearchResult) {
    onSelect(result);
    setQuery("");
    setResults(null);
  }

  const rows = (results ?? []).filter((r) => !selectedIds.includes(r.id));

  const ring = (
    <div className="flex w-9 shrink-0 justify-center lg:w-[52px]" aria-hidden="true">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#4CC9A6] bg-bg text-[#4CC9A6] lg:h-12 lg:w-12">
        <PlusIcon size={16} />
      </div>
    </div>
  );

  if (!open) {
    return (
      <div className="flex scroll-mt-20 gap-3 lg:gap-6">
        {ring}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-16 w-full flex-1 flex-col items-start gap-0.5 rounded-2xl border border-dashed border-[#2C4A48] bg-transparent px-4 py-3.5 text-start transition-[border-color,background-color] duration-[160ms] hover:border-[#4CC9A6] hover:bg-[rgba(76,201,166,0.05)] lg:rounded-[18px]"
        >
          <MonoLabel size="text-[10px]" className="text-[#4CC9A6]">
            ADD NODE
          </MonoLabel>
          <span className="text-[15px] font-extrabold text-ink">افزودن آیتم به لیست</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex scroll-mt-20 gap-3 lg:gap-6">
      {ring}

      <div className="rv-card-in flex min-w-0 flex-1 flex-col gap-3.5 rounded-2xl border border-dashed border-[#2C4A48] bg-[#0C1119] p-4 lg:rounded-[18px] lg:p-[22px]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-0.5 text-start">
            <MonoLabel size="text-[10px]" className="text-[#4CC9A6]">
              ADD NODE
            </MonoLabel>
            <span className="text-base font-extrabold text-ink">
              افزودن آیتم #<span className="num">{toFaDigits(nextRank)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="بستن"
            className="-me-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:text-ink"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <label className="flex h-[46px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-dim focus-within:border-[#4CC9A6]/60">
          <SearchIcon size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="عنوان فیلم، سریال یا شخص"
            aria-label="جستجوی عنوان"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
          />
        </label>

        {debouncedQuery && (
          <>
            <div className="flex items-center gap-2">
              <MonoLabel size="text-[10px]" className="text-dim">
                RESULTS
              </MonoLabel>
              <span className="text-xs text-muted">نتایج</span>
            </div>

            {results === null ? (
              <p className="text-[13px] text-dim">در حال جستجو…</p>
            ) : rows.length === 0 ? (
              <p className="text-[13px] text-dim">نتیجه‌ای پیدا نشد.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((r) => {
                  const title = displayTitle(r);
                  const label = typeLabel(r.type);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-2.5"
                    >
                      <div className="relative h-[66px] w-11 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
                        {r.image_url ? (
                          <Image src={r.image_url} alt="" fill sizes="44px" className="object-cover" />
                        ) : (
                          <span className="absolute inset-0 bg-gradient-brand" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start">
                        <span className="text-sm font-extrabold leading-[1.5] text-ink">{title}</span>
                        <MonoLabel size="text-[9px]" className="text-gold">
                          {label.en}
                        </MonoLabel>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelect(r)}
                        aria-label={`افزودن ${title}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4CC9A6] bg-[rgba(76,201,166,0.1)] text-[#4CC9A6] transition-[background-color] duration-[160ms] hover:bg-[rgba(76,201,166,0.2)]"
                      >
                        <PlusIcon size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
