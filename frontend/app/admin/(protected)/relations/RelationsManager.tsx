"use client";
import { useCallback, useEffect, useState } from "react";
import { toFaDigits } from "@/lib/format-number";

interface Ent {
  id: string;
  entity_type: string;
  title: string;
  title_fa: string | null;
  slug: string;
}
interface Relation {
  id: string;
  relation_type: string;
  source: string;
  metadata: { character?: string };
  from: Ent;
  to: Ent;
}
interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

const REL_LABELS: Record<string, string> = {
  directed_by: "کارگردان",
  acted_in: "بازیگر",
  creator: "سازنده",
  has_genre: "ژانر",
};
const TYPE_LABELS: Record<string, string> = { movie: "فیلم", tv_series: "سریال", person: "هنرمند", genre: "ژانر" };
// relation -> [source type label, target type label, target entity type]
const REL_TARGET: Record<string, string> = { directed_by: "person", acted_in: "person", creator: "person", has_genre: "genre" };

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";
const btn = "rounded-lg bg-gold px-4 py-2 text-sm font-medium text-bg disabled:opacity-50";

async function call<T>(base: "relations" | "entity-manager", path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/${base}${path}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message || `خطا (${res.status})`);
  return json;
}

const name = (e: Ent) => e.title_fa ? `${e.title_fa} — ${e.title}` : e.title;

/** Type-ahead picker over /admin/entity-manager. */
function EntityPicker({ label, types, onPick }: { label: string; types: string[]; onPick: (e: Ent) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Ent[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const found: Ent[] = [];
      for (const type of types) {
        try {
          const qs = new URLSearchParams({ q: q.trim(), entity_type: type, page_size: "8" });
          found.push(...(await call<Ent[]>("entity-manager", `?${qs}`)).data);
        } catch {
          /* ignore */
        }
      }
      setResults(found);
    }, 250);
    return () => clearTimeout(t);
  }, [q, types]);
  return (
    <div className="relative">
      <input className={`${field} w-full`} placeholder={label} value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-bg" onClick={() => { onPick(r); setQ(""); setResults([]); }}>
                {name(r)} <span className="text-xs text-muted">· {TYPE_LABELS[r.entity_type] ?? r.entity_type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RelationsManager() {
  const [entity, setEntity] = useState<Ent | null>(null);
  const [rels, setRels] = useState<Relation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [relType, setRelType] = useState("acted_in");
  const [other, setOther] = useState<Ent | null>(null);
  const [character, setCharacter] = useState("");

  const load = useCallback(async () => {
    if (!entity) return;
    setLoading(true);
    try {
      const res = await call<Relation[]>("relations", `?entity_id=${entity.id}&page_size=200`);
      setRels(res.data);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا" });
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    void load();
  }, [load]);

  const isTitle = entity?.entity_type === "movie" || entity?.entity_type === "tv_series";
  const targetType = REL_TARGET[relType];

  async function add() {
    if (!entity || !other) return;
    setBusy(true);
    try {
      await call("relations", "", {
        method: "POST",
        body: JSON.stringify({
          // titles are the source: title --relation--> person/genre
          from_entity_id: isTitle ? entity.id : other.id,
          to_entity_id: isTitle ? other.id : entity.id,
          relation_type: relType,
          character: relType === "acted_in" ? character || null : null,
        }),
      });
      setNotice({ ok: true, text: "رابطه اضافه شد." });
      setOther(null);
      setCharacter("");
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "اضافه نشد" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: Relation) {
    if (!window.confirm(`رابطهٔ «${REL_LABELS[r.relation_type] ?? r.relation_type}»: ${r.from.title} ← ${r.to.title} حذف شود؟`)) return;
    setBusy(true);
    try {
      await call("relations", `/${r.id}`, { method: "DELETE" });
      setNotice({ ok: true, text: "رابطه حذف شد." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "حذف نشد" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {!entity ? (
        <EntityPicker label="جستجوی فیلم، سریال، هنرمند یا ژانر (حداقل ۲ حرف)…" types={["movie", "tv_series", "person", "genre"]} onPick={setEntity} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div>
            <p className="font-medium text-ink">{name(entity)}</p>
            <p className="text-xs text-muted">{TYPE_LABELS[entity.entity_type] ?? entity.entity_type} · {toFaDigits(total)} رابطه</p>
          </div>
          <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink" onClick={() => { setEntity(null); setRels([]); setNotice(null); }}>
            انتخاب موجودیت دیگر
          </button>
        </div>
      )}

      {notice && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? "border-teal/40 text-teal" : "border-red-500/40 text-red-400"}`}>{notice.text}</p>
      )}

      {entity && (
        <>
          <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-ink">
              {isTitle ? "افزودن رابطه به این عنوان" : "افزودن این موجودیت به یک عنوان"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <select className={field} value={relType} onChange={(e) => { setRelType(e.target.value); setOther(null); }}>
                {Object.entries(REL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {other ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink">
                  <span className="truncate">{name(other)}</span>
                  <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setOther(null)}>تغییر</button>
                </div>
              ) : (
                <EntityPicker
                  label={isTitle ? (targetType === "genre" ? "جستجوی ژانر…" : "جستجوی هنرمند…") : "جستجوی فیلم یا سریال…"}
                  types={isTitle ? [targetType] : relType === "creator" ? ["tv_series"] : ["movie", "tv_series"]}
                  onPick={setOther}
                />
              )}
            </div>
            {relType === "acted_in" && (
              <input dir="ltr" className={`${field} w-full`} maxLength={200} placeholder="نام شخصیت (اختیاری)" value={character} onChange={(e) => setCharacter(e.target.value)} />
            )}
            <button type="button" className={btn} disabled={busy || !other} onClick={add}>افزودن رابطه</button>
          </div>

          <p className="text-xs text-muted">{loading ? "در حال بارگذاری…" : `${toFaDigits(total)} رابطه`}</p>
          <ul className="space-y-2">
            {rels.map((r) => {
              const self = r.from.id === entity.id;
              const peer = self ? r.to : r.from;
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                  <span className="min-w-0 text-sm">
                    <span className="me-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      {REL_LABELS[r.relation_type] ?? r.relation_type}
                      {self ? "" : " (معکوس)"}
                    </span>
                    <span className="text-ink">{name(peer)}</span>
                    <span className="text-xs text-muted"> · {TYPE_LABELS[peer.entity_type] ?? peer.entity_type}</span>
                    {r.metadata.character && <span dir="ltr" className="text-xs text-muted"> · as {r.metadata.character}</span>}
                    {r.source === "manual" && <span className="ms-2 rounded-full border border-gold/40 px-2 py-0.5 text-xs text-gold">دستی</span>}
                  </span>
                  <button type="button" disabled={busy} onClick={() => remove(r)} className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1 text-xs text-red-400 disabled:opacity-50">
                    حذف
                  </button>
                </li>
              );
            })}
            {!loading && rels.length === 0 && <li className="py-8 text-center text-sm text-muted">رابطه‌ای نیست.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
