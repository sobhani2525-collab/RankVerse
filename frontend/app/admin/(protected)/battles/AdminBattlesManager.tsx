"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toFaDigits } from "@/lib/format-number";

interface AdminBattleRow {
  id: string;
  slug: string;
  title: string;
  creator_username: string | null;
  entity_type: string;
  bracket_size: number;
  status: string;
  visibility: string;
  is_official: boolean;
  is_featured: boolean;
  featured_order: number | null;
  is_hidden_from_discovery: boolean;
  curation_note: string | null;
  players_count: number;
  follower_count: number;
  created_at: string;
}

interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

const PAGE_SIZE = 30;
const TYPE_LABEL: Record<string, string> = { movie: "فیلم", tv_series: "سریال" };
const STATUS_LABEL: Record<string, string> = { active: "فعال", completed: "پایان‌یافته", archived: "بایگانی‌شده" };

async function call<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/battles${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

function Switch({ on, label, tone, busy, onClick }: { on: boolean; label: [string, string]; tone: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold transition disabled:opacity-40 ${
        on ? tone : "border-border text-muted hover:border-gold/40"
      }`}
    >
      {on ? label[0] : label[1]}
    </button>
  );
}

export function AdminBattlesManager() {
  const [rows, setRows] = useState<AdminBattleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [featured, setFeatured] = useState<AdminBattleRow[]>([]);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [onlyOfficial, setOnlyOfficial] = useState(false);
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
    if (q.trim()) qs.set("q", q.trim());
    if (status) qs.set("status", status);
    if (onlyFeatured) qs.set("featured", "true");
    if (onlyHidden) qs.set("hidden", "true");
    if (onlyOfficial) qs.set("official", "true");
    try {
      const [list, feat] = await Promise.all([call<AdminBattleRow[]>(`?${qs.toString()}`), call<AdminBattleRow[]>("/featured")]);
      setRows(list.data);
      setTotal(list.meta?.total ?? 0);
      setFeatured(feat.data);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا در دریافت نبردها" });
    } finally {
      setLoading(false);
    }
  }, [page, q, status, onlyFeatured, onlyHidden, onlyOfficial, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function mutate(id: string, run: () => Promise<unknown>, success: string) {
    setBusyId(id);
    try {
      await run();
      setNotice({ ok: true, text: `${success} — صفحهٔ اصلی و /battles بازسازی شد.` });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "ذخیره نشد" });
    } finally {
      setBusyId(null);
    }
  }

  const patch = (row: AdminBattleRow, body: Record<string, unknown>, success: string) =>
    mutate(row.id, () => call(`/${row.id}`, { method: "PATCH", body: JSON.stringify(body) }), success);

  function move(index: number, delta: -1 | 1) {
    const ids = featured.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void mutate(featured[index].id, () => call("/featured/reorder", { method: "POST", body: JSON.stringify({ ids }) }), "ترتیب برگزیده‌ها ذخیره شد");
  }

  function archive(row: AdminBattleRow) {
    if (!window.confirm(`نبرد «${row.title}» بایگانی شود؟ از همهٔ فهرست‌ها و برگزیده‌ها برداشته می‌شود ولی لینک و نتایجش می‌مانند.`)) return;
    void mutate(row.id, () => call(`/${row.id}`, { method: "DELETE" }), "نبرد بایگانی شد");
  }

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reset = () => setPage(1);

  return (
    <div className="mt-6 space-y-8">
      {notice && (
        <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.ok ? "border-teal/40 bg-teal/10 text-teal" : "border-gold/40 bg-gold/10 text-gold"}`}>
          {notice.text}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-ink">برگزیده‌های فعلی</h2>
        {featured.length === 0 ? (
          <p className="mt-3 text-sm text-muted">نبرد برگزیده‌ای نیست؛ بخش «بگذار فیلم‌ها بجنگند» صفحهٔ اصلی نبرد موضوعی خودکار را نشان می‌دهد.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {featured.map((f, i) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                <span className="num w-6 text-center font-bold text-gold">{toFaDigits(i + 1)}</span>
                <span className="flex-1 truncate text-ink">{f.title}</span>
                <span className="text-xs text-muted">{f.creator_username}</span>
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
          <input value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="جستجو در عنوان یا نام سازنده" className={`${field} w-64`} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className={field}>
            <option value="">همهٔ وضعیت‌ها</option>
            <option value="active">فعال</option>
            <option value="completed">پایان‌یافته</option>
            <option value="archived">بایگانی‌شده</option>
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); reset(); }} className={field}>
            <option value="newest">تازه‌ترین</option>
            <option value="popular">بیشترین مشارکت</option>
            <option value="followed">بیشترین دنبال‌کننده</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyFeatured} onChange={(e) => { setOnlyFeatured(e.target.checked); reset(); }} /> فقط برگزیده
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyOfficial} onChange={(e) => { setOnlyOfficial(e.target.checked); reset(); }} /> فقط رسمی
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyHidden} onChange={(e) => { setOnlyHidden(e.target.checked); reset(); }} /> فقط پنهان
          </label>
        </div>

        <div className={`mt-4 overflow-x-auto rounded-xl border border-border bg-surface ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-3 py-2">عنوان</th>
                <th className="px-3 py-2">سازنده</th>
                <th className="px-3 py-2">نوع</th>
                <th className="px-3 py-2">وضعیت</th>
                <th className="px-3 py-2">مشارکت</th>
                <th className="px-3 py-2">دنبال‌کننده</th>
                <th className="px-3 py-2">تاریخ</th>
                <th className="px-3 py-2">برگزیده</th>
                <th className="px-3 py-2">رسمی</th>
                <th className="px-3 py-2">پنهان از کشف</th>
                <th className="px-3 py-2">یادداشت</th>
                <th className="px-3 py-2">بایگانی</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const note = notes[row.id] ?? row.curation_note ?? "";
                const busy = busyId === row.id;
                return (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[240px] px-3 py-2">
                      <Link href={`/battles/${row.slug}`} target="_blank" className="block truncate text-ink hover:text-teal">{row.title}</Link>
                      <span dir="ltr" className="block truncate text-[11px] text-muted">{row.slug} · {toFaDigits(row.bracket_size)}</span>
                    </td>
                    <td className="px-3 py-2 text-muted">{row.creator_username}</td>
                    <td className="px-3 py-2 text-muted">{TYPE_LABEL[row.entity_type] ?? row.entity_type}</td>
                    <td className="px-3 py-2 text-xs text-muted">{STATUS_LABEL[row.status] ?? row.status}</td>
                    <td className="num px-3 py-2">{toFaDigits(row.players_count)}</td>
                    <td className="num px-3 py-2">{toFaDigits(row.follower_count)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(row.created_at).toLocaleDateString("fa-IR")}</td>
                    <td className="px-3 py-2">
                      <Switch on={row.is_featured} busy={busy} tone="border-gold/50 bg-gold/15 text-gold" label={["★ برگزیده", "برگزیده کن"]}
                        onClick={() => patch(row, { is_featured: !row.is_featured }, row.is_featured ? "از برگزیده‌ها برداشته شد" : "نبرد برگزیده شد")} />
                    </td>
                    <td className="px-3 py-2">
                      <Switch on={row.is_official} busy={busy} tone="border-violet-light/50 bg-violet-light/15 text-violet-light" label={["رسمی", "عادی"]}
                        onClick={() => patch(row, { is_official: !row.is_official }, row.is_official ? "نبرد عادی شد" : "نبرد رسمی شد")} />
                    </td>
                    <td className="px-3 py-2">
                      <Switch on={row.is_hidden_from_discovery} busy={busy} tone="border-teal/50 bg-teal/15 text-teal" label={["پنهان", "نمایان"]}
                        onClick={() => patch(row, { is_hidden_from_discovery: !row.is_hidden_from_discovery }, row.is_hidden_from_discovery ? "نبرد دوباره دیده می‌شود" : "نبرد از کشف پنهان شد")} />
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
                      <button type="button" disabled={busy || row.status === "archived"} onClick={() => archive(row)} className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-40">
                        بایگانی
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-10 text-center text-muted">نبردی پیدا نشد.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span className="num">{toFaDigits(total)} نبرد</span>
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
