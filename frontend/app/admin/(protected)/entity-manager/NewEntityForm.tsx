"use client";
import { useEffect, useState } from "react";
import { AwardFields, awardPayload, awardValid, emptyAward, type AwardDraft } from "./AwardsEditor";

interface Created {
  id: string;
  title: string;
  slug: string;
}
interface Genre {
  id: string;
  title: string;
  title_fa: string | null;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const lbl = "text-xs text-muted";
const btn = "rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg disabled:opacity-50";

const EMPTY = {
  entity_type: "movie",
  title: "",
  title_fa: "",
  year: "",
  overview: "",
  image_url: "",
  imdb_id: "",
  original_language: "",
  country: "",
  runtime: "",
  release_date: "",
  last_air_date: "",
  number_of_seasons: "",
  number_of_episodes: "",
  status: "",
  youtube_trailer_key: "",
  aparat_trailer_url: "",
};

const num = (v: string) => (v.trim() ? Number(v) : null);
const str = (v: string) => (v.trim() ? v.trim() : null);

/** Create a movie, series or person with every field the site uses (incl. genres and awards). */
export function NewEntityForm({ onCreated, onError }: { onCreated: (e: Created) => void; onError: (msg: string) => void }) {
  const [f, setF] = useState(EMPTY);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [awards, setAwards] = useState<AwardDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const isPerson = f.entity_type === "person";
  const isSeries = f.entity_type === "tv_series";
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    fetch("/api/admin/entity-manager?entity_type=genre&page_size=100", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setGenres(j.data ?? []))
      .catch(() => {});
  }, []);

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        entity_type: f.entity_type,
        title: f.title,
        title_fa: str(f.title_fa),
        year: num(f.year),
        overview: str(f.overview),
        image_url: str(f.image_url),
        awards: awards.filter(awardValid).map(awardPayload),
      };
      if (!isPerson) {
        Object.assign(body, {
          imdb_id: str(f.imdb_id),
          original_language: str(f.original_language),
          country: str(f.country),
          release_date: str(f.release_date),
          youtube_trailer_key: str(f.youtube_trailer_key),
          aparat_trailer_url: str(f.aparat_trailer_url),
          genre_ids: genreIds,
          ...(isSeries
            ? {
                last_air_date: str(f.last_air_date),
                number_of_seasons: num(f.number_of_seasons),
                number_of_episodes: num(f.number_of_episodes),
                status: str(f.status),
              }
            : { runtime: num(f.runtime) }),
        });
      }
      const res = await fetch("/api/admin/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
      setF(EMPTY);
      setGenreIds([]);
      setAwards([]);
      onCreated(json.data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "ساخته نشد");
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof typeof EMPTY, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={lbl}>
      {label}
      <input className={`${field} mt-1 w-full`} value={f[k]} onChange={set(k)} {...props} />
    </label>
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>
          نوع
          <select className={`${field} mt-1 w-full`} value={f.entity_type} onChange={set("entity_type")}>
            <option value="movie">فیلم</option>
            <option value="tv_series">سریال</option>
            <option value="person">هنرمند (بازیگر / کارگردان)</option>
          </select>
        </label>
        {input("year", isPerson ? "سال تولد" : isSeries ? "سال شروع پخش" : "سال انتشار", { inputMode: "numeric", maxLength: 4 })}
        {input("title", "نام لاتین / اصلی *", { dir: "ltr", maxLength: 500 })}
        {input("title_fa", "نام فارسی", { dir: "rtl", maxLength: 500 })}
        {input("image_url", isPerson ? "لینک عکس (https)" : "لینک پوستر (https)", { dir: "ltr", maxLength: 1000, placeholder: "https://…" })}

        {!isPerson && (
          <>
            {input("imdb_id", "شناسهٔ IMDb", { dir: "ltr", placeholder: "tt1234567", maxLength: 12 })}
            {input("original_language", "زبان اصلی (کد دوحرفی)", { dir: "ltr", placeholder: "fa", maxLength: 3 })}
            {input("country", "کشور (کد دوحرفی)", { dir: "ltr", placeholder: "IR", maxLength: 2 })}
            {input("release_date", isSeries ? "تاریخ اولین پخش" : "تاریخ انتشار", { dir: "ltr", type: "date" })}
            {isSeries ? (
              <>
                {input("last_air_date", "تاریخ آخرین پخش", { dir: "ltr", type: "date" })}
                {input("number_of_seasons", "تعداد فصل", { inputMode: "numeric", maxLength: 3 })}
                {input("number_of_episodes", "تعداد قسمت", { inputMode: "numeric", maxLength: 5 })}
                <label className={lbl}>
                  وضعیت
                  <select className={`${field} mt-1 w-full`} value={f.status} onChange={set("status")}>
                    <option value="">—</option>
                    <option value="Returning Series">در حال پخش</option>
                    <option value="Ended">پایان‌یافته</option>
                    <option value="Canceled">لغوشده</option>
                    <option value="In Production">در حال تولید</option>
                  </select>
                </label>
              </>
            ) : (
              input("runtime", "مدت (دقیقه)", { inputMode: "numeric", maxLength: 4 })
            )}
            {input("youtube_trailer_key", "کلید تریلر یوتیوب", { dir: "ltr", placeholder: "dQw4w9WgXcQ", maxLength: 20 })}
            {input("aparat_trailer_url", "لینک تریلر آپارات", { dir: "ltr", placeholder: "https://www.aparat.com/v/…", maxLength: 2000 })}
          </>
        )}
      </div>

      <label className={`${lbl} block`}>
        {isPerson ? "بیوگرافی فارسی" : "خلاصهٔ فارسی"}
        <textarea dir="rtl" rows={5} maxLength={5000} className={`${field} mt-1 w-full leading-7`} value={f.overview} onChange={set("overview")} />
      </label>

      {!isPerson && genres.length > 0 && (
        <div>
          <p className={`${lbl} mb-1`}>ژانرها</p>
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => {
              const on = genreIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGenreIds((ids) => (on ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-gold bg-gold/15 text-gold" : "border-border text-muted hover:text-ink"}`}
                >
                  {g.title_fa ?? g.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className={lbl}>جوایز و دستاوردها (اختیاری)</p>
        {awards.map((a, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <AwardFields value={a} onChange={(v) => setAwards((list) => list.map((x, j) => (j === i ? v : x)))} />
            <button type="button" className="rounded-lg border border-border px-3 text-xs text-muted" onClick={() => setAwards((l) => l.filter((_, j) => j !== i))}>
              حذف
            </button>
          </div>
        ))}
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink" onClick={() => setAwards((l) => [...l, emptyAward()])}>
          + افزودن جایزه
        </button>
      </div>

      <p className="text-xs text-muted">کارگردان، بازیگران و سازندگان را بعد از ساخت در صفحهٔ «روابط» وصل کنید.</p>
      <button type="button" disabled={busy || !f.title.trim()} onClick={submit} className={btn}>
        {busy ? "در حال ساخت…" : "ساخت موجودیت"}
      </button>
    </div>
  );
}
