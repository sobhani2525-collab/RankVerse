"use client";
import { useCallback, useEffect, useState } from "react";
import { adminApiCall } from "@/lib/admin-users";
import { relativeTimeFa } from "@/lib/relative-time";
import { Pagination } from "../_components/Pagination";
import { ToastProvider, useToast } from "../_components/Toast";

interface ContactMessage {
  id: string;
  category: string;
  subject: string;
  message: string;
  name: string | null;
  email: string | null;
  page_url: string | null;
  user_id: string | null;
  username: string | null;
  status: "new" | "reviewed";
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "گزارش خطا",
  inappropriate: "محتوای نامناسب",
  content_error: "اطلاعات نادرست",
  suggestion: "پیشنهاد و انتقاد",
  copyright: "حق نشر",
  other: "سایر",
};
const CATEGORY_TONE: Record<string, string> = {
  bug: "bg-red-500/10 text-red-400",
  inappropriate: "bg-gold/10 text-gold",
  copyright: "bg-gold/10 text-gold",
};
const STATUS_OPTIONS = [
  { value: "new", label: "جدید" },
  { value: "reviewed", label: "بررسی‌شده" },
  { value: "", label: "همه" },
];
// page_url is typed by the sender: only same-site paths and http(s) URLs become links.
const safeHref = (url: string) => (/^(\/(?!\/)|https?:\/\/)/i.test(url) ? url : null);
const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

export function MessagesManager() {
  return (
    <ToastProvider>
      <Manager />
    </ToastProvider>
  );
}

function Manager() {
  const toast = useToast();
  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("new");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (status) qs.set("status", status);
      if (category) qs.set("category", category);
      const res = await adminApiCall<ContactMessage[]>("contact-messages", `?${qs.toString()}`);
      setRows(res.data);
      setTotal(res.meta?.total ?? res.data.length);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [status, category, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(row: ContactMessage, body: { status?: "new" | "reviewed"; admin_note?: string }, done: string) {
    try {
      await adminApiCall("contact-messages", `/${row.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast({ text: done, ok: true });
      await load();
      window.dispatchEvent(new Event("admin-messages-changed"));
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "خطا", ok: false });
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={field}
          aria-label="وضعیت"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className={field}
          aria-label="موضوع"
        >
          <option value="">همهٔ موضوع‌ها</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={load} className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50">
          تازه‌سازی
        </button>
      </div>

      {error ? (
        <p className="mt-8 text-sm text-muted">
          خطا در دریافت پیام‌ها.{" "}
          <button onClick={load} className="text-teal">
            تلاش مجدد
          </button>
        </p>
      ) : loading && rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">در حال بارگذاری…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted">پیامی وجود ندارد.</p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {rows.map((m) => {
              const open = expanded === m.id;
              const note = notes[m.id] ?? m.admin_note ?? "";
              return (
                <li key={m.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${CATEGORY_TONE[m.category] ?? "bg-teal/10 text-teal"}`}>
                          {CATEGORY_LABELS[m.category] ?? m.category}
                        </span>
                        {m.status === "new" ? (
                          <span className="text-xs font-bold text-gold">جدید</span>
                        ) : (
                          <span className="text-xs text-teal">بررسی‌شده</span>
                        )}
                        <span className="text-xs text-muted">{relativeTimeFa(m.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm font-bold text-ink">{m.subject}</p>
                      <p className="mt-1 text-xs text-muted">
                        {m.username ? (
                          <a href={`/admin/users/${m.user_id}`} className="text-teal hover:underline">
                            {m.username}
                          </a>
                        ) : (
                          m.name || "مهمان"
                        )}
                        {m.email && (
                          <>
                            {" · "}
                            <a href={`mailto:${m.email}`} dir="ltr" className="hover:text-teal">
                              {m.email}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm">
                      <button onClick={() => setExpanded(open ? null : m.id)} className="text-muted transition hover:text-teal">
                        {open ? "بستن" : "متن پیام"}
                      </button>
                      {m.status === "new" ? (
                        <button
                          onClick={() => save(m, { status: "reviewed" }, "پیام بررسی‌شده علامت خورد")}
                          className="rounded-lg border border-teal/40 px-3 py-1.5 text-teal transition hover:bg-teal/10"
                        >
                          بررسی شد
                        </button>
                      ) : (
                        <button
                          onClick={() => save(m, { status: "new" }, "پیام دوباره جدید شد")}
                          className="rounded-lg border border-border px-3 py-1.5 text-ink transition hover:border-gold/50"
                        >
                          برگرداندن به جدید
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-3">
                      <p className="whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm leading-7 text-ink">{m.message}</p>
                      {m.page_url && (
                        <p className="text-xs text-muted">
                          صفحه:{" "}
                          {safeHref(m.page_url) ? (
                            <a
                              href={safeHref(m.page_url)!}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              dir="ltr"
                              className="break-all text-teal hover:underline"
                            >
                              {m.page_url}
                            </a>
                          ) : (
                            <span dir="ltr" className="break-all">
                              {m.page_url}
                            </span>
                          )}
                        </p>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="min-w-0 flex-1">
                          <span className="mb-1 block text-xs text-muted">یادداشت داخلی</span>
                          <input
                            value={note}
                            onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
                            maxLength={1000}
                            className={`${field} w-full`}
                          />
                        </label>
                        <button
                          onClick={() => save(m, { admin_note: note }, "یادداشت ذخیره شد")}
                          disabled={note === (m.admin_note ?? "")}
                          className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50 disabled:opacity-40"
                        >
                          ذخیره یادداشت
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
