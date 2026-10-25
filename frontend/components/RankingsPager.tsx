import { TransitionLink as Link } from "@/components/NavTransition";
import { pageWindow } from "@/lib/pagination";
import { toFaDigits } from "@/lib/format-number";

/**
 * Previous / numbered pages / next for a ranked list. `hrefFor(page)` builds the
 * link for a page (it carries the active filters). Renders nothing when the list
 * fits on one page.
 */
export default function RankingsPager({
  page,
  totalPages,
  hasNext,
  hrefFor,
}: {
  page: number;
  totalPages: number | null;
  hasNext: boolean;
  hrefFor: (page: number) => string;
}) {
  if (page <= 1 && !hasNext) return null;

  return (
    <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
          → قبلی
        </Link>
      ) : (
        <span />
      )}
      {totalPages !== null ? (
        <ol className="flex flex-wrap items-center justify-center gap-1.5" aria-label="شمارهٔ صفحه">
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted">
                …
              </li>
            ) : (
              <li key={p}>
                <Link
                  href={hrefFor(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`صفحهٔ ${toFaDigits(p)}`}
                  className={`num flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition ${
                    p === page ? "border-gold/50 bg-gold/15 text-gold" : "border-border text-muted hover:border-gold/40 hover:text-ink"
                  }`}
                >
                  {toFaDigits(p)}
                </Link>
              </li>
            ),
          )}
        </ol>
      ) : (
        <span className="text-xs text-muted">
          صفحهٔ <span className="num">{toFaDigits(page)}</span>
        </span>
      )}
      {hasNext ? (
        <Link href={hrefFor(page + 1)} className="btn-secondary text-sm hover:border-gold/40 hover:text-gold">
          بعدی ←
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
