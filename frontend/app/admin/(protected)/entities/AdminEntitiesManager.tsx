"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toFaDigits } from "@/lib/format-number";

interface OverviewRow {
  id: string;
  entity_type: string;
  title: string;
  slug: string;
  year: number | null;
  vote_count: number | null;
  overview: string | null;
  overview_en: string | null;
  overview_source: "tmdb_fa" | "machine" | "manual" | "en" | null;
  trailer_key: string | null; // YouTube, from TMDb
  aparat_trailer: string | null;
}

interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

const PAGE_SIZE = 20;

const SOURCE_LABELS: Record<string, string> = {
  tmdb_fa: "TMDb فارسی",
  machine: "ترجمهٔ ماشینی",
  manual: "دستی",
  en: "ترجمه‌نشده",
};

const TYPE_LABELS: Record<string, string> = { movie: "فیلم", tv_series: "سریال" };

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

async function call<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/entities${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json;
}

const hasPersian = (s: string | null) => !!s && /[؀-ۿ]/.test(s);

export function AdminEntitiesManager() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // ?q= (the SEO page's fix list links here) opens on that title, whatever its overview source.
  const initialQ = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [source, setSource] = useState(initialQ ? "" : "en");
  const [trailer, setTrailer] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [trailerDrafts, setTrailerDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (q.trim()) qs.set("q", q.trim());
    if (source) qs.set("source", source);
    if (trailer) qs.set("trailer", trailer);
    try {
      const res = await call<OverviewRow[]>(`?${qs.toString()}`);
      setRows(res.data);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا در دریافت فهرست" });
    } finally {
      setLoading(false);
    }
  }, [page, q, source, trailer]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function toggle(row: OverviewRow) {
    if (openId === row.id) return setOpenId(null);
    setOpenId(row.id);
    setDrafts((d) => (row.id in d ? d : { ...d, [row.id]: hasPersian(row.overview) ? row.overview ?? "" : "" }));
  }

  async function run(row: OverviewRow, fn: () => Promise<unknown>, success: string) {
    setBusyId(row.id);
    try {
      await fn();
      setNotice({ ok: true, text: `${success}: «${row.title}»` });
      const drop = (d: Record<string, string>) => {
        const { [row.id]: _drop, ...rest } = d;
        return rest;
      };
      setDrafts(drop);
      setTrailerDrafts(drop);
      setOpenId(null);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "ذخیره نشد" });
    } finally {
      setBusyId(null);
    }
  }

  const save = (row: OverviewRow) =>
    run(row, () => call(`/${row.id}/overview`, { method: "PUT", body: JSON.stringify({ overview: drafts[row.id] ?? "" }) }), "متن دستی ذخیره شد");

  function reset(row: OverviewRow) {
    if (!window.confirm(`متن دستی «${row.title}» حذف شود؟ عنوان به حالت ترجمه‌نشده برمی‌گردد و در اجرای بعدی ترجمه دوباره ترجمه می‌شود.`)) return;
    void run(row, () => call(`/${row.id}/overview`, { method: "DELETE" }), "متن دستی حذف شد");
  }

  const saveTrailer = (row: OverviewRow) =>
    run(row, () => call(`/${row.id}/trailer`, { method: "PUT", body: JSON.stringify({ url: trailerDrafts[row.id] ?? "" }) }), "تریلر آپارات ذخیره شد");

  function removeTrailer(row: OverviewRow) {
    if (!window.confirm(`تریلر آپارات «${row.title}» حذف شود؟`)) return;
    void run(row, () => call(`/${row.id}/trailer`, { method: "DELETE" }), "تریلر آپارات حذف شد");
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${field} min-w-56 flex-1`}
          placeholder="جستجوی عنوان…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select className={field} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          <option value="en">ترجمه‌نشده</option>
          <option value="machine">ترجمهٔ ماشینی</option>
          <option value="manual">دستی</option>
          <option value="tmdb_fa">TMDb فارسی</option>
          <option value="">همه</option>
        </select>
        <select className={field} value={trailer} onChange={(e) => { setTrailer(e.target.value); setPage(1); }}>
          <option value="">تریلر: همه</option>
          <option value="none">بدون تریلر</option>
          <option value="aparat">تریلر آپارات دارد</option>
        </select>
      </div>

      {notice && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-teal/40 text-teal" : "border-red-500/40 text-red-400"}`}>
          {notice.text}
        </p>
      )}

      <p className="text-xs text-muted">
        {toFaDigits(total)} عنوان — مرتب‌شده بر اساس تعداد رأی TMDb {loading && "(در حال بارگذاری…)"}
      </p>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border bg-surface">
            <button type="button" onClick={() => toggle(row)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{row.title}</span>
                <span className="text-xs text-muted">
                  {TYPE_LABELS[row.entity_type] ?? row.entity_type}
                  {row.year ? ` · ${toFaDigits(row.year)}` : ""}
                  {row.vote_count != null ? ` · ${toFaDigits(row.vote_count)} رأی` : ""}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                {row.aparat_trailer && (
                  <span className="rounded-full border border-teal/40 px-2 py-0.5 text-xs text-teal">آپارات</span>
                )}
                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                  {row.overview_source ? SOURCE_LABELS[row.overview_source] : "بدون خلاصه"}
                </span>
              </span>
            </button>

            {openId === row.id && (
              <div className="space-y-3 border-t border-border px-4 py-4">
                {row.overview_en && (
                  <div>
                    <p className="mb-1 text-xs text-muted">متن انگلیسی</p>
                    <p dir="ltr" className="rounded-lg bg-bg px-3 py-2 text-start text-sm leading-6 text-ink">{row.overview_en}</p>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-muted" htmlFor={`ov-${row.id}`}>خلاصهٔ فارسی (نام افراد و شخصیت‌ها لاتین بماند)</label>
                  <textarea
                    id={`ov-${row.id}`}
                    dir="rtl"
                    rows={6}
                    maxLength={5000}
                    className={`${field} w-full leading-7`}
                    value={drafts[row.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id || !hasPersian(drafts[row.id] ?? "")}
                    onClick={() => save(row)}
                    className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
                  >
                    ذخیرهٔ متن دستی
                  </button>
                  {row.overview_source === "manual" && (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => reset(row)}
                      className="rounded-lg border border-border px-4 py-2 text-sm text-ink disabled:opacity-50"
                    >
                      حذف متن دستی
                    </button>
                  )}
                </div>

                <div className="space-y-2 border-t border-border pt-3">
                  <label className="block text-xs text-muted" htmlFor={`tr-${row.id}`}>
                    تریلر آپارات — لینک ویدیو (aparat.com/v/…) یا کد embed
                    {row.trailer_key ? " · تریلر یوتیوب از TMDb هم دارد" : " · تریلر یوتیوب ندارد"}
                  </label>
                  {row.aparat_trailer && (
                    <p className="text-xs text-ink">
                      فعلی:{" "}
                      <a
                        href={`https://www.aparat.com/v/${encodeURIComponent(row.aparat_trailer)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="text-gold hover:underline"
                      >
                        {row.aparat_trailer}
                      </a>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <input
                      id={`tr-${row.id}`}
                      dir="ltr"
                      maxLength={2000}
                      placeholder="https://www.aparat.com/v/…"
                      className={`${field} min-w-56 flex-1`}
                      value={trailerDrafts[row.id] ?? ""}
                      onChange={(e) => setTrailerDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      disabled={busyId === row.id || !(trailerDrafts[row.id] ?? "").trim()}
                      onClick={() => saveTrailer(row)}
                      className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
                    >
                      {row.aparat_trailer ? "جایگزینی تریلر" : "ذخیرهٔ تریلر"}
                    </button>
                    {row.aparat_trailer && (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => removeTrailer(row)}
                        className="rounded-lg border border-border px-4 py-2 text-sm text-ink disabled:opacity-50"
                      >
                        حذف تریلر
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
        {!loading && rows.length === 0 && <li className="py-8 text-center text-sm text-muted">موردی پیدا نشد.</li>}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" className={field} disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
          <span className="text-muted">{toFaDigits(page)} / {toFaDigits(pages)}</span>
          <button type="button" className={field} disabled={page >= pages} onClick={() => setPage(page + 1)}>بعدی</button>
        </div>
      )}
    </div>
  );
}
