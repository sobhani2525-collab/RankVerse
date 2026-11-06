"use client";
import { useCallback, useEffect, useState } from "react";
import { AwardFields, awardPayload, awardValid, emptyAward, useAwardOptions, type AwardDraft } from "./AwardsEditor";

interface AwardRow {
  id: string;
  award: string;
  category: string;
  year: number;
  status: "won" | "nominated";
  for_title: string | null;
  for_entity_id: string | null;
}
interface Title {
  id: string;
  title: string;
  title_fa: string | null;
  year: number | null;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/entity-manager${path}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json.data as T;
}

/** List / add / delete awards of one entity. A person's award can name the title it was won for. */
export function AwardsPanel({ entityId, isPerson }: { entityId: string; isPerson: boolean }) {
  const opts = useAwardOptions();
  const [rows, setRows] = useState<AwardRow[]>([]);
  const [draft, setDraft] = useState<AwardDraft>(emptyAward());
  const [forQ, setForQ] = useState("");
  const [forResults, setForResults] = useState<Title[]>([]);
  const [forTitle, setForTitle] = useState<Title | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<AwardRow[]>(`/awards/for/${entityId}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "خطا");
    }
  }, [entityId]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isPerson || forQ.trim().length < 2) return setForResults([]);
    const t = setTimeout(async () => {
      const out: Title[] = [];
      for (const type of ["movie", "tv_series"]) {
        try {
          out.push(...(await api<Title[]>(`?${new URLSearchParams({ q: forQ.trim(), entity_type: type, page_size: "6" })}`)));
        } catch {
          /* ignore */
        }
      }
      setForResults(out);
    }, 250);
    return () => clearTimeout(t);
  }, [forQ, isPerson]);

  const awardName = (k: string) => opts?.awards.find((a) => a.key === k)?.name_fa ?? k;

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/awards/for/${entityId}`, {
        method: "POST",
        body: JSON.stringify({ ...awardPayload(draft), for_entity_id: forTitle?.id ?? null }),
      });
      setDraft(emptyAward());
      setForTitle(null);
      setForQ("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "اضافه نشد");
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: AwardRow) {
    if (!window.confirm(`جایزهٔ «${awardName(r.award)} ${r.year} — ${r.category}» حذف شود؟`)) return;
    try {
      await api(`/awards/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "حذف نشد");
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-muted">جوایز و دستاوردها ({rows.length})</p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg px-3 py-1.5 text-sm text-ink">
            <span className="min-w-0">
              {awardName(r.award)} {r.year} · <span dir="ltr">{r.category}</span> · {r.status === "won" ? "برنده" : "نامزد"}
              {r.for_title && <span className="text-muted"> · برای «{r.for_title}»</span>}
            </span>
            <button type="button" className="shrink-0 text-xs text-red-400" onClick={() => remove(r)}>حذف</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <AwardFields value={draft} onChange={setDraft} />
      </div>
      {isPerson && (
        <div className="relative">
          {forTitle ? (
            <p className="text-xs text-ink">
              برای عنوان: {forTitle.title_fa ?? forTitle.title}{" "}
              <button type="button" className="text-muted" onClick={() => setForTitle(null)}>(حذف)</button>
            </p>
          ) : (
            <>
              <input className={`${field} w-full`} placeholder="برای کدام فیلم/سریال؟ (اختیاری، جستجو)" value={forQ} onChange={(e) => setForQ(e.target.value)} />
              {forResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
                  {forResults.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-bg" onClick={() => { setForTitle(t); setForResults([]); }}>
                        {t.title_fa ? `${t.title_fa} — ${t.title}` : t.title}
                        {t.year ? ` (${t.year})` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      <button type="button" disabled={busy || !awardValid(draft)} onClick={add} className="rounded-lg border border-border px-4 py-1.5 text-sm text-ink disabled:opacity-50">
        + افزودن جایزه
      </button>
    </div>
  );
}
