"use client";
import { useEffect, useState } from "react";

export interface AwardDraft {
  award: string;
  category: string;
  year: string;
  status: "won" | "nominated";
}
interface AwardOptions {
  awards: { key: string; name_fa: string; name_en: string }[];
  categories: { en: string; fa: string }[];
}
interface Envelope<T> {
  data: T;
  error?: { message: string } | null;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

let optionsCache: AwardOptions | null = null;
export function useAwardOptions(): AwardOptions | null {
  const [opts, setOpts] = useState<AwardOptions | null>(optionsCache);
  useEffect(() => {
    if (optionsCache) return;
    fetch("/api/admin/entity-manager/award-options", { cache: "no-store" })
      .then((r) => r.json() as Promise<Envelope<AwardOptions>>)
      .then((j) => {
        optionsCache = j.data;
        setOpts(j.data);
      })
      .catch(() => {});
  }, []);
  return opts;
}

export const emptyAward = (): AwardDraft => ({ award: "oscar", category: "", year: "", status: "won" });
export const awardValid = (a: AwardDraft) => a.category.trim().length > 0 && /^\d{4}$/.test(a.year);
export const awardPayload = (a: AwardDraft) => ({ award: a.award, category: a.category.trim(), year: Number(a.year), status: a.status });

/** One award row (جایزه، دسته، سال، برنده/نامزد) — used by the create form and the detail panel. */
export function AwardFields({ value, onChange }: { value: AwardDraft; onChange: (v: AwardDraft) => void }) {
  const opts = useAwardOptions();
  const listId = "award-categories";
  return (
    <>
      <select className={field} value={value.award} onChange={(e) => onChange({ ...value, award: e.target.value })}>
        {(opts?.awards ?? [{ key: "oscar", name_fa: "اسکار", name_en: "" }]).map((a) => (
          <option key={a.key} value={a.key}>{a.name_fa}</option>
        ))}
      </select>
      <input
        dir="ltr"
        list={listId}
        className={`${field} min-w-48 flex-1`}
        placeholder="Category، مثلاً Best Director"
        maxLength={200}
        value={value.category}
        onChange={(e) => onChange({ ...value, category: e.target.value })}
      />
      <datalist id={listId}>
        {opts?.categories.map((c) => (
          <option key={c.en} value={c.en}>{c.fa}</option>
        ))}
      </datalist>
      <input className={`${field} w-24`} inputMode="numeric" maxLength={4} placeholder="سال" value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })} />
      <select className={field} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as "won" | "nominated" })}>
        <option value="won">برنده</option>
        <option value="nominated">نامزد</option>
      </select>
    </>
  );
}
