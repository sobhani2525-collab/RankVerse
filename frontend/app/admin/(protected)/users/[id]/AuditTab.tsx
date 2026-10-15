"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { adminUsersCall } from "@/lib/admin-users";
import { auditActionLabel, auditActionTone, type AdminAuditLogRow } from "@/lib/admin-audit";
import { fullDate } from "@/lib/admin-format";
import { relativeTimeFa } from "@/lib/relative-time";
import { AuditDiff } from "../../_components/AuditDiff";
import { Pagination } from "../../_components/Pagination";

export function AuditTab({ userId, reloadKey }: { userId: string; reloadKey: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<AdminAuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUsersCall<AdminAuditLogRow[]>(`/${userId}/audit-logs?page=${page}&page_size=${pageSize}`);
      setRows(res.data);
      setTotal(res.meta?.total ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در دریافت تاریخچه");
    } finally {
      setLoading(false);
    }
  }, [userId, page, pageSize]);

  // reloadKey: re-fetch after a header action changed the user (a new audit row exists).
  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
        <p>{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-400/50 px-4 py-1.5 font-bold">تلاش مجدد</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`overflow-x-auto rounded-xl border border-border bg-surface ${loading && rows.length > 0 ? "opacity-60" : ""}`}>
        <table className="w-full text-right text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2">زمان</th>
              <th className="px-3 py-2">ادمین</th>
              <th className="px-3 py-2">کار</th>
              <th className="px-3 py-2">جزئیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && Array.from({ length: 3 }, (_, i) => (
              <tr key={i}><td colSpan={4} className="px-3 py-2"><div className="h-6 animate-pulse rounded bg-surface2" /></td></tr>
            ))}
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted" title={fullDate(row.created_at)}>{relativeTimeFa(row.created_at)}</td>
                  <td dir="ltr" className="px-3 py-2 text-start text-xs text-ink">{row.admin_email}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${auditActionTone(row.action)}`}>{auditActionLabel(row.action)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-expanded={openId === row.id}
                      onClick={() => setOpenId(openId === row.id ? null : row.id)}
                      className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-gold/40 hover:text-gold"
                    >
                      {openId === row.id ? "بستن" : "نمایش تغییرات"}
                    </button>
                  </td>
                </tr>
                {openId === row.id && (
                  <tr className="border-b border-border/60 bg-bg/60">
                    <td colSpan={4} className="px-4 py-3">
                      <AuditDiff row={row} />
                      {row.ip && <p dir="ltr" className="mt-2 text-start text-[11px] text-muted">IP: {row.ip}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-muted">هنوز اقدام مدیریتی‌ای برای این کاربر ثبت نشده است.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
    </div>
  );
}
