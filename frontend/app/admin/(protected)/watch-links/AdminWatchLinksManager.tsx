"use client";
import { useCallback, useEffect, useState } from "react";
import { toFaDigits } from "@/lib/format-number";
import { parseWatchCsv } from "@/lib/watch-links";
import { Pagination } from "../_components/Pagination";

interface Meta {
  providers: { key: string; name: string; domains: string[] }[];
  access_types: { key: string; name: string }[];
}
interface LinkRow {
  id: string;
  entity_id: string;
  entity_type: string;
  entity_title: string;
  entity_slug: string;
  provider: string;
  provider_name: string;
  url: string;
  access_type: string;
  is_affiliate: boolean;
  source: string;
  click_count: number;
}
interface EntityHit {
  id: string;
  entity_type: string;
  title: string;
  slug: string;
  year: number | null;
  link_count: number;
}
interface ImportResult {
  row: number;
  entity_slug: string;
  ok: boolean;
  error: string | null;
}
interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const button = "rounded-lg border border-border px-4 py-2 text-sm text-ink transition hover:border-gold/40 hover:text-gold disabled:opacity-50";

async function call<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/watch-links${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json;
}

const pageHref = (type: string, slug: string) => (type === "tv_series" ? `/tv-series/${slug}` : `/movies/${slug}`);

export function AdminWatchLinksManager() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0); // bumped after any write to reload the table

  useEffect(() => {
    call<Meta>("/providers")
      .then((r) => setMeta(r.data))
      .catch((e) => setNotice({ ok: false, text: e instanceof Error ? e.message : "خطا در دریافت سرویس‌ها" }));
  }, []);

  const wrote = (text: string) => {
    setNotice({ ok: true, text });
    setVersion((v) => v + 1);
  };

  return (
    <div className="mt-6 space-y-8">
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-teal/40 text-teal" : "border-red-500/40 text-red-400"}`}>
          {notice.text}
        </p>
      )}
      {meta && (
        <>
          <AddLinkForm meta={meta} onSaved={wrote} onError={(text) => setNotice({ ok: false, text })} />
          <ImportForm meta={meta} onDone={wrote} onError={(text) => setNotice({ ok: false, text })} />
          <LinksTable meta={meta} version={version} onDeleted={wrote} onError={(text) => setNotice({ ok: false, text })} />
        </>
      )}
    </div>
  );
}

function AddLinkForm({ meta, onSaved, onError }: { meta: Meta; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<EntityHit[]>([]);
  const [picked, setPicked] = useState<EntityHit | null>(null);
  const [provider, setProvider] = useState(meta.providers[0]?.key ?? "");
  const [access, setAccess] = useState("subscription");
  const [url, setUrl] = useState("");
  const [affiliate, setAffiliate] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (picked || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      call<EntityHit[]>(`/entities?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.data))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    try {
      await call("", {
        method: "PUT",
        body: JSON.stringify({ entity_id: picked.id, provider, url, access_type: access, is_affiliate: affiliate }),
      });
      const name = meta.providers.find((p) => p.key === provider)?.name ?? provider;
      onSaved(`لینک ${name} برای «${picked.title}» ذخیره شد`);
      setUrl("");
      setAffiliate(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "ذخیره نشد");
    } finally {
      setBusy(false);
    }
  }

  const domains = meta.providers.find((p) => p.key === provider)?.domains.join("، ");

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-border bg-surface/60 p-5">
      <h2 className="font-bold text-ink">افزودن یا ویرایش لینک</h2>
      <div className="relative">
        <label htmlFor="wl-entity" className="mb-1 block text-xs text-muted">فیلم یا سریال</label>
        {picked ? (
          <div className="flex items-center justify-between rounded-lg border border-gold/40 px-3 py-2 text-sm text-ink">
            <span>
              {picked.title} {picked.year ? `(${toFaDigits(picked.year)})` : ""} · {picked.entity_type === "tv_series" ? "سریال" : "فیلم"}
            </span>
            <button type="button" onClick={() => { setPicked(null); setQ(""); }} className="text-xs text-muted hover:text-ink">تغییر</button>
          </div>
        ) : (
          <>
            <input id="wl-entity" className={`${field} w-full`} placeholder="جستجوی عنوان…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {hits.length > 0 && (
              <ul className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-surface shadow-xl">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => setPicked(h)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-right text-sm text-ink hover:bg-surface2">
                      <span className="truncate">
                        {h.title} {h.year ? `(${toFaDigits(h.year)})` : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {h.entity_type === "tv_series" ? "سریال" : "فیلم"}
                        {h.link_count > 0 ? ` · ${toFaDigits(h.link_count)} لینک` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="wl-provider" className="mb-1 block text-xs text-muted">سرویس</label>
          <select id="wl-provider" className={`${field} w-full`} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {meta.providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="wl-access" className="mb-1 block text-xs text-muted">نوع دسترسی</label>
          <select id="wl-access" className={`${field} w-full`} value={access} onChange={(e) => setAccess(e.target.value)}>
            {meta.access_types.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="wl-url" className="mb-1 block text-xs text-muted">لینک (https، دامنهٔ مجاز: {domains})</label>
        <input id="wl-url" dir="ltr" type="url" required className={`${field} w-full`} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={affiliate} onChange={(e) => setAffiliate(e.target.checked)} />
        لینک همکاری (affiliate)
      </label>
      <button type="submit" disabled={busy || !picked || !url} className={button}>{busy ? "در حال ذخیره…" : "ذخیره"}</button>
    </form>
  );
}

function ImportForm({ meta, onDone, onError }: { meta: Meta; onDone: (t: string) => void; onError: (t: string) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  async function submit() {
    const { rows, errors } = parseWatchCsv(text);
    setParseErrors(errors);
    setResults(null);
    if (rows.length === 0) return onError("هیچ ردیف معتبری در متن نبود");
    setBusy(true);
    try {
      const res = await call<ImportResult[]>("/import", { method: "POST", body: JSON.stringify({ rows }) });
      setResults(res.data);
      const ok = res.data.filter((r) => r.ok).length;
      onDone(`${toFaDigits(ok)} لینک ذخیره شد، ${toFaDigits(res.data.length - ok)} ردیف خطا داشت`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "ورود گروهی ممکن نشد");
    } finally {
      setBusy(false);
    }
  }

  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface/60 p-5">
      <h2 className="font-bold text-ink">ورود گروهی (CSV)</h2>
      <p className="text-xs leading-6 text-muted">
        هر خط: <span dir="ltr" className="font-mono">slug,service,url[,access,affiliate]</span> — سرویس یکی از{" "}
        <span dir="ltr" className="font-mono">{meta.providers.map((p) => p.key).join(" / ")}</span>، دسترسی یکی از{" "}
        <span dir="ltr" className="font-mono">{meta.access_types.map((a) => a.key).join(" / ")}</span> (پیش‌فرض subscription)، و affiliate برابر 1 یا true.
        تا ۵۰۰ خط. ردیف‌های درست ذخیره می‌شوند و بقیه گزارش می‌شوند.
      </p>
      <textarea
        dir="ltr"
        rows={6}
        className={`${field} w-full font-mono`}
        placeholder={"the-godfather-1972,filimo,https://www.filimo.com/m/12345,subscription,0"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" onClick={submit} disabled={busy || !text.trim()} className={button}>{busy ? "در حال ارسال…" : "ورود لینک‌ها"}</button>
      {parseErrors.length > 0 && (
        <ul className="list-disc pr-5 text-xs text-red-400">{parseErrors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}
      {failed.length > 0 && (
        <ul className="list-disc space-y-1 pr-5 text-xs text-red-400">
          {failed.map((r) => (
            <li key={r.row}>خط {toFaDigits(r.row)} ({r.entity_slug}): {r.error}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinksTable({ meta, version, onDeleted, onError }: { meta: Meta; version: number; onDeleted: (t: string) => void; onError: (t: string) => void }) {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (q.trim()) qs.set("q", q.trim());
    if (provider) qs.set("provider", provider);
    try {
      const res = await call<LinkRow[]>(`?${qs.toString()}`);
      setRows(res.data);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "خطا در دریافت فهرست");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, q, provider, version]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function remove(row: LinkRow) {
    if (!window.confirm(`لینک ${row.provider_name} برای «${row.entity_title}» حذف شود؟`)) return;
    try {
      await call(`/${row.id}`, { method: "DELETE" });
      onDeleted(`لینک ${row.provider_name} برای «${row.entity_title}» حذف شد`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "حذف نشد");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-ink">لینک‌های ثبت‌شده</h2>
      <div className="flex flex-wrap gap-3">
        <input className={`${field} min-w-56 flex-1`} placeholder="جستجوی عنوان…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className={field} value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} aria-label="سرویس">
          <option value="">همهٔ سرویس‌ها</option>
          {meta.providers.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-right">عنوان</th>
              <th className="px-3 py-2 text-right">سرویس</th>
              <th className="px-3 py-2 text-right">دسترسی</th>
              <th className="px-3 py-2 text-right">کلیک</th>
              <th className="px-3 py-2 text-right">منبع</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">هنوز لینکی ثبت نشده است.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <a href={pageHref(r.entity_type, r.entity_slug)} target="_blank" rel="noreferrer" className="text-ink hover:text-gold">{r.entity_title}</a>
                </td>
                <td className="px-3 py-2">
                  <a href={r.url} target="_blank" rel="noreferrer noopener" dir="ltr" className="text-ink hover:text-gold">{r.provider_name}</a>
                  {r.is_affiliate && <span className="mr-2 rounded-full border border-gold/40 px-2 py-0.5 text-[10px] text-gold">همکاری</span>}
                </td>
                <td className="px-3 py-2 text-muted">{meta.access_types.find((a) => a.key === r.access_type)?.name ?? r.access_type}</td>
                <td className="num px-3 py-2">{toFaDigits(r.click_count)}</td>
                <td className="px-3 py-2 text-xs text-muted">{r.source}</td>
                <td className="px-3 py-2 text-left">
                  <button type="button" onClick={() => remove(r)} className="text-xs text-red-400 hover:underline">حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
    </section>
  );
}
