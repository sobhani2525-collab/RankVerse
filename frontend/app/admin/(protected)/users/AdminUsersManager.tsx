"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { adminUsersCall, type AdminUserRow, type AdminUserStats } from "@/lib/admin-users";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import { Pagination } from "../_components/Pagination";
import { StatCard } from "../_components/StatCard";
import { StatusBadge } from "../_components/StatusBadge";
import { ToastProvider, useToast } from "../_components/Toast";
import { UserAvatar } from "../_components/UserAvatar";

const T = {
  searchPlaceholder: "جستجو: نام، ایمیل، username یا شناسه",
  filters: "فیلترها",
  clearAll: "پاک کردن همه",
  retry: "تلاش مجدد",
  loadError: "خطا در دریافت کاربران",
  emptyTitle: "کاربری پیدا نشد.",
  emptyHint: "فیلترها را تغییر دهید یا پاک کنید.",
  neverLoggedIn: "هرگز وارد نشده",
  undo: "بازگشت",
  view: "مشاهده",
  block: "مسدود کردن",
  unblock: "رفع مسدودیت",
  sendReset: "ارسال لینک بازیابی رمز",
  remove: "حذف کاربر",
  restore: "بازیابی کاربر",
  verified: "تأیید شده",
  unverified: "تأیید نشده",
};

const TABS: { key: string; label: string; params: Record<string, string>; count: (s: AdminUserStats) => number }[] = [
  { key: "all", label: "همه", params: {}, count: (s) => s.total },
  { key: "active", label: "فعال", params: { status: "active" }, count: (s) => s.total - s.blocked },
  { key: "blocked", label: "مسدود", params: { status: "blocked" }, count: (s) => s.blocked },
  { key: "unverified", label: "تأیید نشده", params: { email_verified: "false" }, count: (s) => s.unverified },
  { key: "deleted", label: "حذف‌شده‌ها", params: { status: "deleted" }, count: (s) => s.deleted },
];

const STATUS_LABEL: Record<string, string> = { active: "فعال", blocked: "مسدود", deleted: "حذف‌شده", all: "همه (با حذف‌شده‌ها)" };

const COLUMNS: { key: string; label: string; sort?: string }[] = [
  { key: "user", label: "کاربر", sort: "username" },
  { key: "email", label: "ایمیل", sort: "email" },
  { key: "status", label: "وضعیت" },
  { key: "verified", label: "ایمیل" },
  { key: "ratings", label: "رتبه‌ها", sort: "ratings_count" },
  { key: "lists", label: "فهرست‌ها", sort: "lists_count" },
  { key: "comments", label: "کامنت‌ها" },
  { key: "created", label: "عضویت", sort: "created_at" },
  { key: "login", label: "آخرین ورود", sort: "last_login_at" },
  { key: "actions", label: "عملیات" },
];

const DEFAULT_PAGE_SIZE = 25;
const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const FILTER_KEYS = ["status", "email_verified", "created_from", "created_to", "last_login_from", "last_login_to", "never_logged_in"];

function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString("fa-IR")} — ${d.toLocaleString("en-GB")}`;
}

function startOfDayIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
function endOfDayIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

type DialogState = { kind: "block" | "delete" | "reset"; user: AdminUserRow } | null;

export function AdminUsersManager() {
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

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const get = (name: string) => searchParams.get(name) ?? "";
  const page = Math.max(1, Number(get("page")) || 1);
  const pageSize = Number(get("page_size")) || DEFAULT_PAGE_SIZE;
  const sort = get("sort") || "created_at";
  const order = get("order") === "asc" ? "asc" : "desc";

  const setParams = useCallback(
    (updates: Record<string, string | null>, keepPage = false) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!keepPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // --- search box (debounced into the URL) ---
  const [searchText, setSearchText] = useState(get("q"));
  const debouncedSearch = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debouncedSearch.trim() !== get("q")) setParams({ q: debouncedSearch.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  // Keep the box in sync when the URL changes elsewhere (chip removal, back button).
  useEffect(() => {
    setSearchText(searchParams.get("q") ?? "");
  }, [searchParams]);

  // --- data ---
  const apiQuery = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ["q", ...FILTER_KEYS, "sort", "order"]) {
      const v = searchParams.get(k);
      if (!v) continue;
      if (k === "created_from" || k === "last_login_from") p.set(k, startOfDayIso(v));
      else if (k === "created_to" || k === "last_login_to") p.set(k, endOfDayIso(v));
      else p.set(k, v);
    }
    p.set("page", String(page));
    p.set("page_size", String(pageSize));
    return p.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadStats = useCallback(async () => {
    try {
      setStats((await adminUsersCall<AdminUserStats>("/stats")).data);
    } catch {
      /* tiles just stay as they were */
    }
  }, []);

  const reqId = useRef(0);
  const loadRows = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await adminUsersCall<AdminUserRow[]>(`?${apiQuery}`);
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
  }, [apiQuery]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);
  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const refresh = () => Promise.all([loadRows(), loadStats()]);

  // --- actions ---
  async function run(path: string, method: string, body?: unknown) {
    await adminUsersCall(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  async function act(
    user: AdminUserRow,
    path: string,
    method: string,
    body: unknown,
    success: string,
    undo?: { label: string; path: string; method: string; body?: unknown; done: string },
  ) {
    setBusy(true);
    try {
      await run(path, method, body);
      toast({
        text: success,
        action: undo && {
          label: undo.label,
          run: () => {
            run(undo.path, undo.method, undo.body)
              .then(() => {
                toast({ text: undo.done });
                return refresh();
              })
              .catch((err) => toast({ ok: false, text: err instanceof Error ? err.message : "انجام نشد" }));
          },
        },
      });
      setDialog(null);
      await refresh();
    } catch (err) {
      toast({ ok: false, text: err instanceof Error ? err.message : "انجام نشد" });
    } finally {
      setBusy(false);
    }
  }

  const base = (u: AdminUserRow) => `/${u.id}`;
  const unblock = (u: AdminUserRow) => act(u, `${base(u)}/unblock`, "POST", undefined, `«${u.username}» از مسدودیت خارج شد`, {
    label: T.undo, path: `${base(u)}/block`, method: "POST", body: { reason: "بازگشت رفع مسدودیت" }, done: "دوباره مسدود شد",
  });
  const restore = (u: AdminUserRow) => act(u, `${base(u)}/restore`, "POST", undefined, `«${u.username}» بازیابی شد`, {
    label: T.undo, path: base(u), method: "DELETE", done: "دوباره حذف شد",
  });

  function confirmDialog() {
    if (!dialog) return null;
    const { kind, user } = dialog;
    const cancel = () => !busy && setDialog(null);
    if (kind === "block") {
      return (
        <ConfirmDialog
          title={`مسدود کردن «${user.username}»`}
          description="کاربر مسدود نمی‌تواند وارد شود و نشست‌های فعلی‌اش هم بسته می‌شود. فهرست‌ها و رای‌هایش حذف نمی‌شود."
          confirmLabel={T.block}
          danger
          busy={busy}
          reason={{ label: "دلیل مسدودسازی (الزامی)" }}
          onCancel={cancel}
          onConfirm={(reason) =>
            act(user, `${base(user)}/block`, "POST", { reason }, `«${user.username}» مسدود شد`, {
              label: T.undo, path: `${base(user)}/unblock`, method: "POST", done: "مسدودیت برداشته شد",
            })
          }
        />
      );
    }
    if (kind === "delete") {
      return (
        <ConfirmDialog
          title={`حذف «${user.username}»`}
          description="حذف نرم است: حساب از سایت پنهان می‌شود و ورود ممکن نیست، اما داده‌ها می‌مانند و بعداً قابل بازیابی است."
          confirmLabel={T.remove}
          danger
          busy={busy}
          requireText={user.username}
          onCancel={cancel}
          onConfirm={() =>
            act(user, base(user), "DELETE", undefined, `«${user.username}» حذف شد`, {
              label: T.undo, path: `${base(user)}/restore`, method: "POST", done: "کاربر بازیابی شد",
            })
          }
        />
      );
    }
    return (
      <ConfirmDialog
        title="ارسال لینک بازیابی رمز"
        description={<>لینک بازیابی رمز به <bdi>{user.email}</bdi> ایمیل می‌شود.</>}
        confirmLabel="ارسال"
        busy={busy}
        onCancel={cancel}
        onConfirm={() => act(user, `${base(user)}/send-password-reset`, "POST", undefined, "لینک بازیابی ارسال شد")}
      />
    );
  }

  // --- derived UI state ---
  const activeTab =
    TABS.find((t) => {
      const keys = Object.keys(t.params);
      const other = FILTER_KEYS.filter((k) => !keys.includes(k) && get(k));
      return other.length === 0 && keys.every((k) => get(k) === t.params[k]);
    })?.key ?? null;

  const chips = useMemo(() => {
    const out: { key: string; label: string; keys: string[] }[] = [];
    if (get("q")) out.push({ key: "q", label: `جستجو: ${get("q")}`, keys: ["q"] });
    if (get("status")) out.push({ key: "status", label: `وضعیت: ${STATUS_LABEL[get("status")] ?? get("status")}`, keys: ["status"] });
    if (get("email_verified")) out.push({ key: "ev", label: `ایمیل ${get("email_verified") === "true" ? T.verified : T.unverified}`, keys: ["email_verified"] });
    if (get("created_from")) out.push({ key: "cf", label: `عضویت از ${new Date(get("created_from")).toLocaleDateString("fa-IR")}`, keys: ["created_from"] });
    if (get("created_to")) out.push({ key: "ct", label: `عضویت تا ${new Date(get("created_to")).toLocaleDateString("fa-IR")}`, keys: ["created_to"] });
    if (get("last_login_from")) out.push({ key: "lf", label: `ورود از ${new Date(get("last_login_from")).toLocaleDateString("fa-IR")}`, keys: ["last_login_from"] });
    if (get("last_login_to")) out.push({ key: "lt", label: `ورود تا ${new Date(get("last_login_to")).toLocaleDateString("fa-IR")}`, keys: ["last_login_to"] });
    if (get("never_logged_in") === "true") out.push({ key: "nl", label: T.neverLoggedIn, keys: ["never_logged_in"] });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const clearAll = () => setParams(Object.fromEntries(["q", ...FILTER_KEYS].map((k) => [k, null])));

  function toggleSort(key: string) {
    if (sort === key) setParams({ order: order === "asc" ? "desc" : "asc" }, true);
    else setParams({ sort: key, order: key === "username" || key === "email" ? "asc" : "desc" }, true);
  }

  const detailHref = (u: AdminUserRow) => `/admin/users/${u.id}`;

  return (
    <div className="mt-6 space-y-5">
      <section aria-label="آمار" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="کل کاربران" value={stats?.total ?? null} />
        <StatCard label="جدید ۷ روز اخیر" value={stats?.new_7d ?? null} change={stats?.new_7d_change_pct} />
        <StatCard label="جدید ۳۰ روز اخیر" value={stats?.new_30d ?? null} change={stats?.new_30d_change_pct} />
        <StatCard label="فعال امروز" value={stats?.active_today ?? null} />
        <StatCard label="مسدود" value={stats?.blocked ?? null} />
        <StatCard label="تأیید نشده" value={stats?.unverified ?? null} />
      </section>

      <div role="tablist" aria-label="دسته‌بندی کاربران" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => setParams({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), ...t.params })}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              activeTab === t.key ? "border-gold/50 bg-gold/15 font-bold text-gold" : "border-border text-muted hover:border-gold/30 hover:text-ink"
            }`}
          >
            {t.label}
            {stats && <span className="num ms-2 text-xs opacity-80">{toFaDigits(t.count(stats))}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="جستجوی کاربران"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={T.searchPlaceholder}
          className={`${field} w-full sm:w-80`}
        />
        <button
          type="button"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-gold/40 hover:text-gold"
        >
          {T.filters}
          {chips.filter((c) => c.key !== "q").length > 0 && <span className="num ms-2 text-gold">{toFaDigits(chips.filter((c) => c.key !== "q").length)}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-muted">
            وضعیت
            <select value={get("status")} onChange={(e) => setParams({ status: e.target.value })} className={`${field} mt-1 w-full`}>
              <option value="">پیش‌فرض (بدون حذف‌شده)</option>
              {Object.entries(STATUS_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            تأیید ایمیل
            <select value={get("email_verified")} onChange={(e) => setParams({ email_verified: e.target.value })} className={`${field} mt-1 w-full`}>
              <option value="">همه</option>
              <option value="true">{T.verified}</option>
              <option value="false">{T.unverified}</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            عضویت از
            <input type="date" value={get("created_from")} onChange={(e) => setParams({ created_from: e.target.value })} className={`${field} mt-1 w-full`} />
          </label>
          <label className="text-xs text-muted">
            عضویت تا
            <input type="date" value={get("created_to")} onChange={(e) => setParams({ created_to: e.target.value })} className={`${field} mt-1 w-full`} />
          </label>
          <label className="text-xs text-muted">
            آخرین ورود از
            <input type="date" value={get("last_login_from")} onChange={(e) => setParams({ last_login_from: e.target.value })} className={`${field} mt-1 w-full`} />
          </label>
          <label className="text-xs text-muted">
            آخرین ورود تا
            <input type="date" value={get("last_login_to")} onChange={(e) => setParams({ last_login_to: e.target.value })} className={`${field} mt-1 w-full`} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={get("never_logged_in") === "true"}
              onChange={(e) => setParams({ never_logged_in: e.target.checked ? "true" : null })}
            />
            {T.neverLoggedIn}
          </label>
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">
              {c.label}
              <button
                type="button"
                aria-label={`حذف فیلتر ${c.label}`}
                onClick={() => setParams(Object.fromEntries(c.keys.map((k) => [k, null])))}
                className="hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="text-xs text-muted underline hover:text-ink">
            {T.clearAll}
          </button>
        </div>
      )}

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-300">
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()} className="mt-3 rounded-lg border border-red-400/50 px-4 py-1.5 font-bold hover:bg-red-500/10">
            {T.retry}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`hidden max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface md:block ${loading && rows.length > 0 ? "opacity-60" : ""}`}>
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-surface text-xs text-muted">
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={c.sort && sort === c.sort ? (order === "asc" ? "ascending" : "descending") : undefined}
                      className="whitespace-nowrap px-3 py-2"
                    >
                      {c.sort ? (
                        <button type="button" onClick={() => toggleSort(c.sort!)} className={`font-bold hover:text-gold ${sort === c.sort ? "text-gold" : ""}`}>
                          {c.label}
                          {sort === c.sort && <span aria-hidden> {order === "asc" ? "▲" : "▼"}</span>}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 && Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td colSpan={COLUMNS.length} className="px-3 py-3">
                      <div className="h-8 animate-pulse rounded bg-surface2" />
                    </td>
                  </tr>
                ))}
                {rows.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => router.push(detailHref(u))}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface2/50"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <UserAvatar avatarKey={u.avatar_key} name={u.display_name || u.username} />
                        <div className="min-w-0">
                          <Link href={detailHref(u)} onClick={(e) => e.stopPropagation()} className="block max-w-[180px] truncate font-bold text-ink hover:text-teal">
                            {u.display_name || u.username}
                          </Link>
                          <span dir="ltr" className="block truncate text-start text-[11px] text-muted">@{u.username}</span>
                        </div>
                      </div>
                    </td>
                    <td dir="ltr" className="max-w-[220px] truncate px-3 py-2 text-start text-xs text-muted">{u.email}</td>
                    <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
                    <td className="px-3 py-2 text-xs">
                      <span className={u.email_verified ? "text-teal" : "text-muted"}>{u.email_verified ? T.verified : T.unverified}</span>
                    </td>
                    <td className="num px-3 py-2">{toFaDigits(u.ratings_count)}</td>
                    <td className="num px-3 py-2">{toFaDigits(u.lists_count)}</td>
                    <td className="num px-3 py-2">{toFaDigits(u.comments_count)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted" title={fullDate(u.created_at)}>
                      {new Date(u.created_at).toLocaleDateString("fa-IR")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted" title={u.last_login_at ? fullDate(u.last_login_at) : undefined}>
                      {u.last_login_at ? relativeTimeFa(u.last_login_at) : T.neverLoggedIn}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <RowMenu user={u} onBlock={() => setDialog({ kind: "block", user: u })} onUnblock={() => void unblock(u)}
                        onDelete={() => setDialog({ kind: "delete", user: u })} onRestore={() => void restore(u)}
                        onReset={() => setDialog({ kind: "reset", user: u })} detailHref={detailHref(u)} />
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-3 py-12 text-center text-muted">
                      <p className="font-bold text-ink">{T.emptyTitle}</p>
                      <p className="mt-1 text-xs">{T.emptyHint}</p>
                      {chips.length > 0 && (
                        <button type="button" onClick={clearAll} className="mt-3 rounded-lg border border-border px-4 py-1.5 text-xs hover:border-gold/40 hover:text-gold">
                          {T.clearAll}
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className={`space-y-3 md:hidden ${loading && rows.length > 0 ? "opacity-60" : ""}`}>
            {loading && rows.length === 0 && Array.from({ length: 4 }, (_, i) => <li key={i} className="h-28 animate-pulse rounded-xl bg-surface2" />)}
            {rows.map((u) => (
              <li key={u.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <UserAvatar avatarKey={u.avatar_key} name={u.display_name || u.username} size={40} />
                  <Link href={detailHref(u)} className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{u.display_name || u.username}</span>
                    <span dir="ltr" className="block truncate text-start text-xs text-muted">{u.email}</span>
                  </Link>
                  <RowMenu user={u} onBlock={() => setDialog({ kind: "block", user: u })} onUnblock={() => void unblock(u)}
                    onDelete={() => setDialog({ kind: "delete", user: u })} onRestore={() => void restore(u)}
                    onReset={() => setDialog({ kind: "reset", user: u })} detailHref={detailHref(u)} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge status={u.status} />
                  <span className={u.email_verified ? "text-teal" : ""}>{u.email_verified ? T.verified : T.unverified}</span>
                </div>
                <dl className="num mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
                  <div><dt>رتبه‌ها</dt><dd className="text-sm text-ink">{toFaDigits(u.ratings_count)}</dd></div>
                  <div><dt>فهرست‌ها</dt><dd className="text-sm text-ink">{toFaDigits(u.lists_count)}</dd></div>
                  <div><dt>کامنت‌ها</dt><dd className="text-sm text-ink">{toFaDigits(u.comments_count)}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">
                  عضویت: {new Date(u.created_at).toLocaleDateString("fa-IR")} · ورود: {u.last_login_at ? relativeTimeFa(u.last_login_at) : T.neverLoggedIn}
                </p>
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

      {confirmDialog()}
    </div>
  );
}

function RowMenu(props: {
  user: AdminUserRow;
  detailHref: string;
  onBlock: () => void;
  onUnblock: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onReset: () => void;
}) {
  const { user } = props;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "block w-full px-3 py-2 text-start text-sm hover:bg-surface2";
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label={`عملیات ${user.username}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-border px-2 py-1 text-muted hover:border-gold/40 hover:text-gold"
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <Link role="menuitem" href={props.detailHref} className={`${item} text-ink`}>{T.view}</Link>
          {user.status !== "deleted" && (
            user.status === "blocked" ? (
              <button role="menuitem" type="button" onClick={pick(props.onUnblock)} className={`${item} text-teal`}>{T.unblock}</button>
            ) : (
              <button role="menuitem" type="button" onClick={pick(props.onBlock)} className={`${item} text-gold`}>{T.block}</button>
            )
          )}
          {user.status !== "deleted" && (
            <button role="menuitem" type="button" onClick={pick(props.onReset)} className={`${item} text-ink`}>{T.sendReset}</button>
          )}
          {user.status === "deleted" ? (
            <button role="menuitem" type="button" onClick={pick(props.onRestore)} className={`${item} text-teal`}>{T.restore}</button>
          ) : (
            <button role="menuitem" type="button" onClick={pick(props.onDelete)} className={`${item} text-red-400`}>{T.remove}</button>
          )}
        </div>
      )}
    </div>
  );
}
