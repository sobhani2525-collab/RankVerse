"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { adminApiCall } from "@/lib/admin-users";
import {
  AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS, auditActionLabel, auditActionTone, auditTargetHref,
  type AdminAuditLogRow,
} from "@/lib/admin-audit";
import { fullDate } from "@/lib/admin-format";
import { relativeTimeFa } from "@/lib/relative-time";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { AuditDiff } from "../_components/AuditDiff";
import { Pagination } from "../_components/Pagination";
import { ToastProvider, useToast } from "../_components/Toast";
import { downloadExport, endOfDayIso, startOfDayIso } from "../users/bulk";

const T = {
  searchPlaceholder: "جستجو: ایمیل ادمین یا شناسهٔ هدف",
  filters: "فیلترها",
  clearAll: "پاک کردن همه",
  export: "خروجی CSV",
  retry: "تلاش مجدد",
  loadError: "خطا در دریافت تاریخچه",
  emptyTitle: "رویدادی پیدا نشد.",
  emptyHint: "فیلترها را تغییر دهید یا پاک کنید.",
};

const DEFAULT_PAGE_SIZE = 25;
const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const FILTER_KEYS = ["admin_id", "target_type", "created_from", "created_to"];

export function AuditLogManager() {
  return (
    <ToastProvider>
      <Manager />
    </ToastProvider>
  );
}

function Manager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const query = searchParams.toString();

  const [rows, setRows] = useState<AdminAuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<{ id: string; email: string }[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const get = (name: string) => searchParams.get(name) ?? "";
  const actions = searchParams.getAll("action");
  const page = Math.max(1, Number(get("page")) || 1);
  const pageSize = Number(get("page_size")) || DEFAULT_PAGE_SIZE;

  const setParams = useCallback(
    (updates: Record<string, string | string[] | null>, keepPage = false) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(updates)) {
        next.delete(k);
        if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
        else if (v) next.set(k, v);
      }
      if (!keepPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // search box, debounced into the URL
  const [searchText, setSearchText] = useState(get("q"));
  const debouncedSearch = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debouncedSearch.trim() !== get("q")) setParams({ q: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  useEffect(() => {
    setSearchText(searchParams.get("q") ?? "");
  }, [searchParams]);

  /** URL filters as API params (date inputs become ISO instants). */
  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (get("q")) p.set("q", get("q"));
    for (const k of FILTER_KEYS) {
      const v = searchParams.get(k);
      if (!v) continue;
      if (k === "created_from") p.set(k, startOfDayIso(v));
      else if (k === "created_to") p.set(k, endOfDayIso(v));
      else p.set(k, v);
    }
    searchParams.getAll("action").forEach((a) => p.append("action", a));
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const p = new URLSearchParams(filterQuery);
    p.set("page", String(page));
    p.set("page_size", String(pageSize));
    try {
      const res = await adminApiCall<AdminAuditLogRow[]>("audit-logs", `?${p.toString()}`);
      if (id !== reqId.current) return;
      setRows(res.data);
      setTotal(res.meta?.total ?? 0);
      setError(null);
    } catch (err) {
      if (id !== reqId.current) return;
      setError(err instanceof Error ? err.message : T.loadError);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [filterQuery, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    adminApiCall<{ id: string; email: string }[]>("audit-logs", "/admins")
      .then((r) => setAdmins(r.data))
      .catch(() => {});
  }, []);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadExport(new URLSearchParams(filterQuery), "/api/admin/audit-logs/export");
      toast({ text: "فایل خروجی آماده شد" });
      void load(); // the export itself is now the newest row
    } catch (err) {
      toast({ ok: false, text: err instanceof Error ? err.message : "خروجی گرفته نشد" });
    } finally {
      setExporting(false);
    }
  }

  const adminEmail = (id: string) => admins.find((a) => a.id === id)?.email ?? id;
  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: Record<string, null | string[]> }[] = [];
    if (get("q")) out.push({ key: "q", label: `جستجو: ${get("q")}`, clear: { q: null } });
    if (get("admin_id")) out.push({ key: "admin", label: `ادمین: ${adminEmail(get("admin_id"))}`, clear: { admin_id: null } });
    for (const a of actions) out.push({ key: `a-${a}`, label: auditActionLabel(a), clear: { action: actions.filter((x) => x !== a) } });
    if (get("target_type")) out.push({ key: "tt", label: `هدف: ${AUDIT_TARGET_LABELS[get("target_type")] ?? get("target_type")}`, clear: { target_type: null } });
    if (get("created_from")) out.push({ key: "cf", label: `از ${new Date(get("created_from")).toLocaleDateString("fa-IR")}`, clear: { created_from: null } });
    if (get("created_to")) out.push({ key: "ct", label: `تا ${new Date(get("created_to")).toLocaleDateString("fa-IR")}`, clear: { created_to: null } });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, admins]);

  const clearAll = () => setParams({ q: null, action: null, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])) });
  const filterCount = chips.filter((c) => c.key !== "q").length;

  const actionBadge = (a: string) => (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${auditActionTone(a)}`}>{auditActionLabel(a)}</span>
  );
  const targetCell = (r: AdminAuditLogRow) => {
    const href = auditTargetHref(r.target_type, r.target_id);
    const label = AUDIT_TARGET_LABELS[r.target_type] ?? r.target_type;
    return href ? (
      <Link href={href} className="hover:text-teal">
        {label} <bdi dir="ltr" className="text-[11px] text-muted">{r.target_id.slice(0, 8)}</bdi>
      </Link>
    ) : (
      <span>
        {label} <bdi dir="ltr" className="text-[11px] text-muted">{r.target_id.slice(0, 8)}</bdi>
      </span>
    );
  };
  const detail = (r: AdminAuditLogRow) => (
    <div className="space-y-2">
      <AuditDiff row={r} />
      <p dir="ltr" className="text-start text-[11px] text-muted">
        {r.ip && <>IP: {r.ip} · </>}
        <span className="break-all">{r.user_agent}</span>
      </p>
    </div>
  );

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="جستجو در تاریخچه"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={T.searchPlaceholder}
          className={`${field} w-full sm:w-80`}
        />
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-gold/40 hover:text-gold">
          {T.filters}
          {filterCount > 0 && <span className="num ms-2 text-gold">{filterCount.toLocaleString("fa-IR")}</span>}
        </button>
        <button
          type="button"
          disabled={exporting || total === 0}
          onClick={() => void exportCsv()}
          className="ms-auto rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-gold/40 hover:text-gold disabled:opacity-40"
        >
          {exporting ? "در حال آماده‌سازی…" : T.export}
        </button>
      </div>

      {showFilters && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted">
              ادمین
              <select value={get("admin_id")} onChange={(e) => setParams({ admin_id: e.target.value })} className={`${field} mt-1 w-full`}>
                <option value="">همه</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.email}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              نوع هدف
              <select value={get("target_type")} onChange={(e) => setParams({ target_type: e.target.value })} className={`${field} mt-1 w-full`}>
                <option value="">همه</option>
                {Object.entries(AUDIT_TARGET_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              از تاریخ
              <input type="date" value={get("created_from")} onChange={(e) => setParams({ created_from: e.target.value })} className={`${field} mt-1 w-full`} />
            </label>
            <label className="text-xs text-muted">
              تا تاریخ
              <input type="date" value={get("created_to")} onChange={(e) => setParams({ created_to: e.target.value })} className={`${field} mt-1 w-full`} />
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-xs text-muted">نوع اقدام (چندتایی)</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(AUDIT_ACTION_LABELS).map(([k, label]) => {
                const on = actions.includes(k);
                return (
                  <label key={k} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${on ? "border-gold/50 bg-gold/15 font-bold text-gold" : "border-border text-muted hover:text-ink"}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setParams({ action: on ? actions.filter((x) => x !== k) : [...actions, k] })}
                      className="sr-only"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">
              {c.label}
              <button type="button" aria-label={`حذف فیلتر ${c.label}`} onClick={() => setParams(c.clear)} className="hover:text-ink">×</button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="text-xs text-muted underline hover:text-ink">{T.clearAll}</button>
        </div>
      )}

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
          <p>{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-red-400/50 px-4 py-1.5 font-bold hover:bg-red-500/10">{T.retry}</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`hidden max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface md:block ${loading && rows.length > 0 ? "opacity-60" : ""}`}>
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-surface text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">زمان</th>
                  <th className="px-3 py-2">ادمین</th>
                  <th className="px-3 py-2">اقدام</th>
                  <th className="px-3 py-2">هدف</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}><td colSpan={6} className="px-3 py-2"><div className="h-7 animate-pulse rounded bg-surface2" /></td></tr>
                ))}
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-border/60 last:border-0 hover:bg-surface2/40">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted" title={fullDate(r.created_at)}>
                        {relativeTimeFa(r.created_at)}
                        <span className="block text-[11px]">{new Date(r.created_at).toLocaleString("fa-IR")}</span>
                      </td>
                      <td dir="ltr" className="px-3 py-2 text-start text-xs text-ink">{r.admin_email}</td>
                      <td className="px-3 py-2">{actionBadge(r.action)}</td>
                      <td className="px-3 py-2 text-xs text-ink">{targetCell(r)}</td>
                      <td dir="ltr" className="px-3 py-2 text-start text-xs text-muted">{r.ip ?? "—"}</td>
                      <td className="px-3 py-2">
                        <button type="button" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)} className="rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-gold/40 hover:text-gold">
                          {openId === r.id ? "بستن" : "نمایش تغییرات"}
                        </button>
                      </td>
                    </tr>
                    {openId === r.id && (
                      <tr className="border-b border-border/60 bg-bg/60">
                        <td colSpan={6} className="px-4 py-3">{detail(r)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-muted">
                      <p className="font-bold text-ink">{T.emptyTitle}</p>
                      <p className="mt-1 text-xs">{T.emptyHint}</p>
                      {chips.length > 0 && (
                        <button type="button" onClick={clearAll} className="mt-3 rounded-lg border border-border px-4 py-1.5 text-xs hover:border-gold/40 hover:text-gold">{T.clearAll}</button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className={`space-y-3 md:hidden ${loading && rows.length > 0 ? "opacity-60" : ""}`}>
            {loading && rows.length === 0 && Array.from({ length: 4 }, (_, i) => <li key={i} className="h-24 animate-pulse rounded-xl bg-surface2" />)}
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {actionBadge(r.action)}
                  <span className="text-xs text-muted" title={fullDate(r.created_at)}>{relativeTimeFa(r.created_at)}</span>
                </div>
                <p dir="ltr" className="mt-2 text-start text-xs text-ink">{r.admin_email}</p>
                <p className="mt-1 text-xs text-ink">{targetCell(r)}</p>
                <button type="button" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)} className="mt-3 rounded border border-border px-2 py-0.5 text-xs text-muted hover:text-gold">
                  {openId === r.id ? "بستن" : "نمایش تغییرات"}
                </button>
                {openId === r.id && <div className="mt-3 border-t border-border/60 pt-3">{detail(r)}</div>}
              </li>
            ))}
            {!loading && rows.length === 0 && (
              <li className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
                <p className="font-bold text-ink">{T.emptyTitle}</p>
                <p className="mt-1 text-xs">{T.emptyHint}</p>
              </li>
            )}
          </ul>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={(p) => setParams({ page: String(p) }, true)}
            onPageSize={(s) => setParams({ page_size: String(s) })}
          />
        </>
      )}
    </div>
  );
}
