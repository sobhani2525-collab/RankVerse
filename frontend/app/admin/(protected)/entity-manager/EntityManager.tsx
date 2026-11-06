"use client";
import { useCallback, useEffect, useState } from "react";
import { toFaDigits } from "@/lib/format-number";

interface Row {
  id: string;
  entity_type: string;
  title: string;
  title_fa: string | null;
  slug: string;
  year: number | null;
  external_source: string | null;
  image_url: string | null;
}
interface Detail extends Row {
  text: string | null;
  text_source: string | null;
  external_id: string | null;
  relation_count: number;
}
interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

const PAGE_SIZE = 30;
const TYPE_LABELS: Record<string, string> = {
  movie: "فیلم",
  tv_series: "سریال",
  person: "هنرمند",
  genre: "ژانر",
  country: "کشور",
  network: "شبکه",
};
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t;
const PUBLIC_PATH: Record<string, string> = { movie: "movies", tv_series: "tv-series", person: "people" };

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const btn = "rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg disabled:opacity-50";
const btnGhost = "rounded-lg border border-border px-4 py-2 text-sm text-ink disabled:opacity-50";

async function call<T>(base: "entity-manager" | "entities", path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json;
}

const EMPTY_NEW = { entity_type: "movie", title: "", title_fa: "", year: "", overview: "", image_url: "" };

export function EntityManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [types, setTypes] = useState<{ entity_type: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [edit, setEdit] = useState({ title: "", title_fa: "", year: "", text: "", image_url: "" });
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (q.trim()) qs.set("q", q.trim());
    if (type) qs.set("entity_type", type);
    if (source) qs.set("source", source);
    try {
      const res = await call<Row[]>("entity-manager", `?${qs}`);
      setRows(res.data);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا در دریافت فهرست" });
    } finally {
      setLoading(false);
    }
  }, [page, q, type, source]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    call<{ entity_type: string; count: number }[]>("entity-manager", "/types")
      .then((r) => setTypes(r.data))
      .catch(() => {});
  }, []);

  async function open(row: Row) {
    if (openId === row.id) return setOpenId(null);
    setOpenId(row.id);
    setDetail(null);
    try {
      const d = (await call<Detail>("entity-manager", `/${row.id}`)).data;
      setDetail(d);
      setEdit({ title: d.title, title_fa: d.title_fa ?? "", year: d.year ? String(d.year) : "", text: d.text ?? "", image_url: d.image_url ?? "" });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا" });
    }
  }

  async function save() {
    if (!detail) return;
    setBusy(true);
    try {
      await call("entity-manager", `/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: edit.title,
          title_fa: edit.title_fa,
          year: edit.year ? Number(edit.year) : 0,
          text: edit.text,
          image_url: edit.image_url,
        }),
      });
      setNotice({ ok: true, text: `ذخیره شد: «${edit.title}»` });
      setOpenId(null);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "ذخیره نشد" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!detail) return;
    const typed = window.prompt(
      `حذف قطعی «${detail.title}» (${typeLabel(detail.entity_type)}) — ${toFaDigits(detail.relation_count)} رابطه و رأی‌ها و آیتم‌های فهرست مربوط هم پاک می‌شود.\nبرای تأیید، نام لاتین را دقیقاً تایپ کنید:`,
    );
    if (typed === null) return;
    if (typed.trim() !== detail.title) {
      setNotice({ ok: false, text: "نام وارد‌شده با نام موجودیت یکی نبود؛ حذف انجام نشد." });
      return;
    }
    setBusy(true);
    try {
      await call("entity-manager", `/${detail.id}`, { method: "DELETE" });
      setNotice({ ok: true, text: `حذف شد: «${detail.title}»` });
      setOpenId(null);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "حذف نشد" });
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const res = await call<{ title: string; slug: string }>("entities", "", {
        method: "POST",
        body: JSON.stringify({
          entity_type: form.entity_type,
          title: form.title,
          title_fa: form.title_fa || null,
          year: form.year ? Number(form.year) : null,
          overview: form.overview || null,
          image_url: form.image_url || null,
        }),
      });
      setNotice({ ok: true, text: `ساخته شد: «${res.data.title}» (${res.data.slug})` });
      setForm(EMPTY_NEW);
      setCreating(false);
      setQ(res.data.title);
      setType("");
      setSource("");
      setPage(1);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "ساخته نشد" });
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isPerson = (t: string) => t === "person";
  const setF = (k: keyof typeof EMPTY_NEW) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setE = (k: keyof typeof edit) => (e: { target: { value: string } }) => setEdit((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-3">
        <input className={`${field} min-w-56 flex-1`} placeholder="جستجوی نام یا اسلاگ…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className={field} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">همهٔ انواع</option>
          {types.map((t) => (
            <option key={t.entity_type} value={t.entity_type}>
              {typeLabel(t.entity_type)} ({toFaDigits(t.count)})
            </option>
          ))}
        </select>
        <select className={field} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
          <option value="">همهٔ منابع</option>
          <option value="manual">ساخته‌شده دستی</option>
          <option value="imported">واردشده (TMDb و …)</option>
        </select>
        <button type="button" className={btn} onClick={() => setCreating((c) => !c)}>
          {creating ? "بستن فرم" : "+ ساخت موجودیت"}
        </button>
      </div>

      {creating && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">
              نوع
              <select className={`${field} mt-1 w-full`} value={form.entity_type} onChange={setF("entity_type")}>
                <option value="movie">فیلم</option>
                <option value="tv_series">سریال</option>
                <option value="person">هنرمند (بازیگر / کارگردان)</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              {isPerson(form.entity_type) ? "سال تولد" : "سال انتشار"} (اختیاری)
              <input className={`${field} mt-1 w-full`} inputMode="numeric" maxLength={4} value={form.year} onChange={setF("year")} />
            </label>
            <label className="text-xs text-muted">
              نام لاتین / اصلی *
              <input dir="ltr" className={`${field} mt-1 w-full`} maxLength={500} value={form.title} onChange={setF("title")} />
            </label>
            <label className="text-xs text-muted">
              نام فارسی
              <input dir="rtl" className={`${field} mt-1 w-full`} maxLength={500} value={form.title_fa} onChange={setF("title_fa")} />
            </label>
          </div>
          <label className="block text-xs text-muted">
            {isPerson(form.entity_type) ? "بیوگرافی فارسی" : "خلاصهٔ فارسی"}
            <textarea dir="rtl" rows={4} maxLength={5000} className={`${field} mt-1 w-full leading-7`} value={form.overview} onChange={setF("overview")} />
          </label>
          <label className="block text-xs text-muted">
            لینک تصویر (https — اختیاری)
            <input dir="ltr" className={`${field} mt-1 w-full`} maxLength={1000} placeholder="https://…" value={form.image_url} onChange={setF("image_url")} />
          </label>
          <button type="button" disabled={busy || !form.title.trim()} onClick={create} className={btn}>
            {busy ? "در حال ساخت…" : "ساخت موجودیت"}
          </button>
        </div>
      )}

      {notice && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-teal/40 text-teal" : "border-red-500/40 text-red-400"}`}>{notice.text}</p>
      )}

      <p className="text-xs text-muted">
        {toFaDigits(total)} موجودیت {loading && "(در حال بارگذاری…)"}
      </p>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border bg-surface">
            <button type="button" onClick={() => open(row)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start">
              <span className="flex min-w-0 items-center gap-3">
                {row.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image_url} alt="" loading="lazy" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-9 shrink-0 rounded bg-bg" />
                )}
                <span className="min-w-0">
                  {row.title_fa && <span className="block truncate font-medium text-ink">{row.title_fa}</span>}
                  <span dir="ltr" className={`block truncate text-start ${row.title_fa ? "text-sm text-muted" : "font-medium text-ink"}`}>{row.title}</span>
                  <span className="text-xs text-muted">
                    {typeLabel(row.entity_type)}
                    {row.year ? ` · ${toFaDigits(row.year)}` : ""}
                  </span>
                </span>
              </span>
              {row.external_source === "manual" && (
                <span className="shrink-0 rounded-full border border-gold/40 px-2 py-0.5 text-xs text-gold">دستی</span>
              )}
            </button>

            {openId === row.id && (
              <div className="space-y-3 border-t border-border px-4 py-4">
                {!detail ? (
                  <p className="text-sm text-muted">در حال بارگذاری…</p>
                ) : (
                  <>
                    <p className="text-xs text-muted" dir="ltr">
                      slug: {detail.slug} · source: {detail.external_source ?? "—"} · {toFaDigits(detail.relation_count)} relations
                      {PUBLIC_PATH[detail.entity_type] && (
                        <>
                          {" · "}
                          <a className="text-gold hover:underline" target="_blank" rel="noopener noreferrer" href={`/${PUBLIC_PATH[detail.entity_type]}/${detail.slug}`}>
                            view
                          </a>
                        </>
                      )}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-muted">
                        نام لاتین / اصلی
                        <input dir="ltr" className={`${field} mt-1 w-full`} maxLength={500} value={edit.title} onChange={setE("title")} />
                      </label>
                      <label className="text-xs text-muted">
                        نام فارسی (خالی = حذف)
                        <input dir="rtl" className={`${field} mt-1 w-full`} maxLength={500} value={edit.title_fa} onChange={setE("title_fa")} />
                      </label>
                      <label className="text-xs text-muted">
                        {isPerson(detail.entity_type) ? "سال تولد" : "سال"} (خالی = حذف)
                        <input className={`${field} mt-1 w-full`} inputMode="numeric" maxLength={4} value={edit.year} onChange={setE("year")} />
                      </label>
                      <label className="text-xs text-muted">
                        لینک تصویر (https)
                        <input dir="ltr" className={`${field} mt-1 w-full`} maxLength={1000} value={edit.image_url} onChange={setE("image_url")} />
                      </label>
                    </div>
                    <label className="block text-xs text-muted">
                      {isPerson(detail.entity_type) ? "بیوگرافی فارسی" : "خلاصهٔ فارسی"} — خالی‌کردن متن را حذف می‌کند
                      <textarea dir="rtl" rows={5} maxLength={5000} className={`${field} mt-1 w-full leading-7`} value={edit.text} onChange={setE("text")} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy || !edit.title.trim()} onClick={save} className={btn}>ذخیرهٔ تغییرات</button>
                      <button type="button" disabled={busy} onClick={() => setOpenId(null)} className={btnGhost}>بستن</button>
                      <button type="button" disabled={busy} onClick={remove} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 disabled:opacity-50 ms-auto">
                        حذف موجودیت
                      </button>
                    </div>
                  </>
                )}
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
