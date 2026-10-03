"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@/lib/format-number";
import { listHref } from "@/lib/list-url";

interface AdminListRow {
  id: string;
  title: string;
  slug: string;
  owner_username: string | null;
  entity_type: string | null;
  item_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  is_featured: boolean;
  featured_order: number | null;
  is_hidden_from_discovery: boolean;
  curation_note: string | null;
}

interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

const PAGE_SIZE = 30;

async function call<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/lists${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

export function AdminListsManager() {
  const [rows, setRows] = useState<AdminListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [featured, setFeatured] = useState<AdminListRow[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [minItems, setMinItems] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
    if (q.trim()) qs.set("q", q.trim());
    if (onlyFeatured) qs.set("featured", "true");
    if (onlyHidden) qs.set("hidden", "true");
    if (entityType) qs.set("entity_type", entityType);
    if (minItems) qs.set("min_items", minItems);
    try {
      const [list, feat] = await Promise.all([
        call<AdminListRow[]>(`?${qs.toString()}`),
        call<AdminListRow[]>("/featured"),
      ]);
      setRows(list.data);
      setTotal(list.meta?.total ?? 0);
      setFeatured(feat.data);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا در دریافت فهرست‌ها" });
    } finally {
      setLoading(false);
    }
  }, [page, q, onlyFeatured, onlyHidden, entityType, minItems, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function mutate(id: string, run: () => Promise<unknown>, success: string) {
    setBusyId(id);
    try {
      await run();
      setNotice({ ok: true, text: `${success} — صفحهٔ اصلی و /lists بازسازی شد.` });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "ذخیره نشد" });
    } finally {
      setBusyId(null);
    }
  }

  const patch = (row: AdminListRow, body: Record<string, unknown>, success: string) =>
    mutate(row.id, () => call(`/${row.id}`, { method: "PATCH", body: JSON.stringify(body) }), success);

  function move(index: number, delta: -1 | 1) {
    const ids = featured.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void mutate(
      featured[index].id,
      () => call("/featured/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
      "ترتیب برگزیده‌ها ذخیره شد",
    );
  }

  function remove(row: AdminListRow) {
    if (!window.confirm(`فهرست «${row.title}» برای همیشه حذف شود؟ آیتم‌ها و کامنت‌هایش هم پاک می‌شوند و برگشت ندارد.`)) return;
    void mutate(row.id, () => call(`/${row.id}`, { method: "DELETE" }), "فهرست حذف شد");
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mt-6 space-y-8">
      {notice && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.ok ? "border-teal/40 bg-teal/10 text-teal" : "border-gold/40 bg-gold/10 text-gold"
          }`}
        >
          {notice.text}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-ink">برگزیده‌های فعلی</h2>
        {featured.length === 0 ? (
          <p className="mt-3 text-sm text-muted">فهرست برگزیده‌ای نیست؛ صفحهٔ اصلی پرلایک‌ترین فهرست باکیفیت را نشان می‌دهد.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {featured.map((f, i) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                <span className="num w-6 text-center font-bold text-gold">{toFaDigits(i + 1)}</span>
                <span className="flex-1 truncate text-ink">{f.title}</span>
                <span className="text-xs text-muted">{f.owner_username}</span>
                <button type="button" disabled={busyId !== null || i === 0} onClick={() => move(i, -1)} aria-label="بالا" className="rounded border border-border px-2 py-1 text-muted hover:text-gold disabled:opacity-30">↑</button>
                <button type="button" disabled={busyId !== null || i === featured.length - 1} onClick={() => move(i, 1)} aria-label="پایین" className="rounded border border-border px-2 py-1 text-muted hover:text-gold disabled:opacity-30">↓</button>
                <button type="button" disabled={busyId !== null} onClick={() => patch(f, { is_featured: false }, "از برگزیده‌ها برداشته شد")} className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-gold/40 hover:text-gold disabled:opacity-30">برداشتن</button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-3">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="جستجو در عنوان یا نام صاحب" className={`${field} w-64`} />
          <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className={field}>
            <option value="">همهٔ انواع</option>
            <option value="movie">فیلم</option>
            <option value="tv_series">سریال</option>
            <option value="person">هنرمند</option>
          </select>
          <input value={minItems} onChange={(e) => { setMinItems(e.target.value.replace(/\D/g, "")); setPage(1); }} placeholder="حداقل آیتم" inputMode="numeric" className={`${field} w-28`} />
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className={field}>
            <option value="newest">تازه‌ترین</option>
            <option value="popular">محبوب‌ترین</option>
            <option value="items">بیشترین آیتم</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyFeatured} onChange={(e) => { setOnlyFeatured(e.target.checked); setPage(1); }} /> فقط برگزیده
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyHidden} onChange={(e) => { setOnlyHidden(e.target.checked); setPage(1); }} /> فقط پنهان
          </label>
        </div>

        <div className={`mt-4 overflow-x-auto rounded-xl border border-border bg-surface ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2">عنوان</th>
                <th className="px-3 py-2">صاحب</th>
                <th className="px-3 py-2">آیتم</th>
                <th className="px-3 py-2">لایک</th>
                <th className="px-3 py-2">کامنت</th>
                <th className="px-3 py-2">تاریخ</th>
                <th className="px-3 py-2">برگزیده</th>
                <th className="px-3 py-2">پنهان از کشف</th>
                <th className="px-3 py-2">یادداشت</th>
                <th className="px-3 py-2">حذف</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const note = notes[row.id] ?? row.curation_note ?? "";
                return (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[260px] px-3 py-2">
                      <Link href={listHref(row.slug)} target="_blank" className="block truncate text-ink hover:text-teal">{row.title}</Link>
                      <span dir="ltr" className="block truncate text-[11px] text-muted">{row.slug}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{row.owner_username}</td>
                    <td className="num px-3 py-2">{toFaDigits(row.item_count)}</td>
                    <td className="num px-3 py-2">{toFaDigits(row.like_count)}</td>
                    <td className="num px-3 py-2">{toFaDigits(row.comment_count)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(row.created_at).toLocaleDateString("fa-IR")}</td>
                    <td className="px-3 py-2">
                      <button type="button" role="switch" aria-checked={row.is_featured} disabled={busyId === row.id} onClick={() => patch(row, { is_featured: !row.is_featured }, row.is_featured ? "از برگزیده‌ها برداشته شد" : "فهرست برگزیده شد")} className={`rounded-full border px-3 py-1 text-xs font-bold transition disabled:opacity-40 ${row.is_featured ? "border-gold/50 bg-gold/15 text-gold" : "border-border text-muted hover:border-gold/40"}`}>
                        {row.is_featured ? "★ برگزیده" : "برگزیده کن"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" role="switch" aria-checked={row.is_hidden_from_discovery} disabled={busyId === row.id} onClick={() => patch(row, { is_hidden_from_discovery: !row.is_hidden_from_discovery }, row.is_hidden_from_discovery ? "فهرست دوباره دیده می‌شود" : "فهرست از کشف پنهان شد")} className={`rounded-full border px-3 py-1 text-xs font-bold transition disabled:opacity-40 ${row.is_hidden_from_discovery ? "border-teal/50 bg-teal/15 text-teal" : "border-border text-muted hover:border-teal/40"}`}>
                        {row.is_hidden_from_discovery ? "پنهان" : "نمایان"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={note}
                        maxLength={500}
                        onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                        onBlur={() => note !== (row.curation_note ?? "") && patch(row, { curation_note: note }, "یادداشت ذخیره شد")}
                        placeholder="یادداشت…"
                        className={`${field} w-40 py-1 text-xs`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" disabled={busyId === row.id} onClick={() => remove(row)} className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-40">
                        حذف
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-muted">فهرستی پیدا نشد.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span className="num">{toFaDigits(total)} فهرست</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-border px-3 py-1 disabled:opacity-30">قبلی</button>
            <span className="num">{toFaDigits(page)} / {toFaDigits(lastPage)}</span>
            <button type="button" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)} className="rounded border border-border px-3 py-1 disabled:opacity-30">بعدی</button>
          </div>
        </div>
      </section>
    </div>
  );
}
