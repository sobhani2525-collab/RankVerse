import { toFaDigits } from "@/lib/format-number";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  pageSizes?: number[];
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

export function Pagination({ page, pageSize, total, pageSizes = [10, 25, 50, 100], onPage, onPageSize }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span className="num">
        نمایش {toFaDigits(from)} تا {toFaDigits(to)} از {toFaDigits(total)}
      </span>
      <div className="flex items-center gap-2">
        <select
          aria-label="تعداد در صفحه"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded border border-border bg-bg px-2 py-1 text-ink"
        >
          {pageSizes.map((s) => (
            <option key={s} value={s}>
              {toFaDigits(s)} در صفحه
            </option>
          ))}
        </select>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded border border-border px-3 py-1 disabled:opacity-30">
          قبلی
        </button>
        <span className="num">
          {toFaDigits(page)} / {toFaDigits(lastPage)}
        </span>
        <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)} className="rounded border border-border px-3 py-1 disabled:opacity-30">
          بعدی
        </button>
      </div>
    </div>
  );
}
