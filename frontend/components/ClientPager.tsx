"use client";
import { pageWindow } from "@/lib/pagination";
import { toFaDigits } from "@/lib/format-number";

/**
 * Previous / numbered pages / next for a grid that loads its pages in the browser
 * (the button twin of RankingsPager, which links). Renders nothing on a single page.
 */
export default function ClientPager({
  page,
  totalPages,
  onPage,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;

  const side = "btn-secondary text-sm hover:border-gold/40 hover:text-gold disabled:pointer-events-none disabled:opacity-40";

  return (
    <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-between gap-4">
      <button type="button" className={side} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        → قبلی
      </button>
      <ol className="flex flex-wrap items-center justify-center gap-1.5" aria-label="شمارهٔ صفحه">
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => p !== page && onPage(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`صفحهٔ ${toFaDigits(p)}`}
                className={`num flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition ${
                  p === page ? "border-gold/50 bg-gold/15 text-gold" : "border-border text-muted hover:border-gold/40 hover:text-ink"
                }`}
              >
                {toFaDigits(p)}
              </button>
            </li>
          ),
        )}
      </ol>
      <button type="button" className={side} disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>
        بعدی ←
      </button>
    </nav>
  );
}
