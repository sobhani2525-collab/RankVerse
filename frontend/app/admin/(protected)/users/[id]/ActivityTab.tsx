"use client";
import { useCallback, useEffect, useState } from "react";
import { adminUsersCall } from "@/lib/admin-users";
import { fullDate, shortDate } from "@/lib/admin-format";
import { toFaDigits } from "@/lib/format-number";
import { Pagination } from "../../_components/Pagination";
import { activityHref, activityTitle, type ActivityKind, type ActivityRow } from "./activity";

const KINDS: { key: ActivityKind; label: string; empty: string }[] = [
  { key: "ratings", label: "رتبه‌ها", empty: "هنوز رتبه‌ای ثبت نکرده است." },
  { key: "favorites", label: "علاقه‌مندی‌ها", empty: "علاقه‌مندی‌ای ندارد." },
  { key: "lists", label: "فهرست‌ها", empty: "فهرستی نساخته است." },
  { key: "comments", label: "کامنت‌ها", empty: "کامنتی نگذاشته است." },
];

const VISIBILITY: Record<string, string> = { public: "عمومی", private: "خصوصی", unlisted: "فقط با لینک" };

export function ActivityTab({ userId }: { userId: string }) {
  const [kind, setKind] = useState<ActivityKind>("ratings");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUsersCall<ActivityRow[]>(`/${userId}/activity?kind=${kind}&page=${page}&page_size=${pageSize}`);
      setRows(res.data);
      setTotal(res.meta?.total ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در دریافت فعالیت‌ها");
    } finally {
      setLoading(false);
    }
  }, [userId, kind, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = KINDS.find((k) => k.key === kind)!;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="نوع فعالیت" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="tab"
            aria-selected={kind === k.key}
            onClick={() => {
              setKind(k.key);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-sm ${kind === k.key ? "border-teal/50 bg-teal/10 font-bold text-teal" : "border-border text-muted hover:text-ink"}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-400/50 px-4 py-1.5 font-bold">تلاش مجدد</button>
        </div>
      ) : (
        <>
          <ul className={`divide-y divide-border/60 rounded-xl border border-border bg-surface ${loading && rows.length > 0 ? "opacity-60" : ""}`}>
            {loading && rows.length === 0 && Array.from({ length: 4 }, (_, i) => <li key={i} className="m-3 h-10 animate-pulse rounded bg-surface2" />)}
            {rows.map((row) => {
              const href = activityHref(kind, row);
              const title = activityTitle(kind, row);
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-ink hover:text-teal">{title}</a>
                    ) : (
                      <span className="font-bold text-ink">{title}</span>
                    )}
                    {kind === "comments" && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{row.body}</p>}
                  </div>
                  {kind === "ratings" && <span className="num font-bold text-gold">{toFaDigits(row.score ?? 0)} / ۵</span>}
                  {kind === "lists" && row.visibility && <span className="text-xs text-muted">{VISIBILITY[row.visibility] ?? row.visibility}</span>}
                  <span className="text-xs text-muted" title={fullDate(row.created_at)}>{shortDate(row.created_at)}</span>
                </li>
              );
            })}
            {!loading && rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted">{current.empty}</li>}
          </ul>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            pageSizes={[10, 20, 50, 100]}
            onPage={setPage}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
