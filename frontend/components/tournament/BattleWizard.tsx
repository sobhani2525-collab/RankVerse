"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import {
  BracketSize,
  ENTITY_TYPE_LABELS,
  TournamentEntity,
  TournamentEntityType,
  tournamentApi,
  tournamentHref,
} from "@/lib/tournament";
import EntryPicker from "./EntryPicker";
import Poster from "./Poster";

const STEPS = ["اطلاعات", "گزینه‌ها", "انتشار"];
const SIZES: BracketSize[] = [4, 8, 16];
const FIELD = "w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/60";

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2.5 text-sm transition ${
        active ? "border-gold bg-gold/10 text-gold" : "border-border text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Three steps: info (creates/updates the private draft) -> entries (picked
 * with search or person/genre/decade filters; their order is the seeding)
 * -> publish settings. ?slug= resumes an existing draft.
 */
export default function BattleWizard() {
  const router = useRouter();
  const resumeSlug = useSearchParams().get("slug");
  const { getToken, isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();

  const [step, setStep] = useState(0);
  const [slug, setSlug] = useState<string | null>(resumeSlug);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState<TournamentEntityType>("movie");
  const [size, setSize] = useState<BracketSize>(8);
  const [entries, setEntries] = useState<TournamentEntity[]>([]);
  const [visibility, setVisibility] = useState<"unlisted" | "public">("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) openLoginModal();
  }, [authLoading, isAuthenticated, openLoginModal]);

  useEffect(() => {
    const token = getToken();
    if (!resumeSlug || !token) return;
    tournamentApi
      .get(resumeSlug, token)
      .then((d) => {
        if (d.status !== "draft" || !d.is_owner) return router.replace(tournamentHref(d.slug));
        setTitle(d.title);
        setDescription(d.description ?? "");
        setEntityType(d.entity_type);
        setSize(d.bracket_size);
        setEntries(d.participants);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "پیش‌نویس پیدا نشد"));
  }, [resumeSlug, getToken, isAuthenticated, router]);

  async function run(action: (token: string) => Promise<void>) {
    const token = getToken();
    if (!token) return openLoginModal();
    setBusy(true);
    setError(null);
    try {
      await action(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  const saveInfo = () =>
    run(async (token) => {
      if (slug) {
        await tournamentApi.update(token, slug, { title, description, entity_type: entityType, bracket_size: size });
      } else {
        const created = await tournamentApi.create(token, {
          title,
          description: description || undefined,
          entity_type: entityType,
          bracket_size: size,
        });
        setSlug(created.slug);
      }
      // Mirror what the server does on a structural change.
      setEntries((prev) => prev.filter((e) => e.entity_type === entityType).slice(0, size));
      setStep(1);
    });

  const saveEntries = () =>
    run(async (token) => {
      await tournamentApi.setEntries(token, slug!, entries.map((e) => e.id));
      setStep(2);
    });

  const publish = () =>
    run(async (token) => {
      await tournamentApi.publish(token, slug!, { visibility });
      router.push(tournamentHref(slug!));
    });

  const full = entries.length >= size;
  const add = (e: TournamentEntity) => !full && !entries.some((x) => x.id === e.id) && setEntries((p) => [...p, e]);
  const addMany = (list: TournamentEntity[]) =>
    setEntries((p) => {
      const ids = new Set(p.map((x) => x.id));
      const next = [...p];
      for (const e of list) if (next.length < size && !ids.has(e.id)) next.push(e);
      return next;
    });
  const move = (i: number, d: -1 | 1) =>
    setEntries((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl text-ink">ساخت نبرد جدید</h1>
      <p className="mt-2 text-sm text-muted">گزینه‌ها را خودت انتخاب می‌کنی؛ بقیه آن‌ها را «برنده می‌ماند» بازی می‌کنند.</p>
      <ol className="mt-6 flex gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex-1 rounded-lg border px-3 py-2 text-center ${
              i === step ? "border-gold text-gold" : i < step ? "border-teal/50 text-teal" : "border-border text-muted"
            }`}
          >
            {toFaDigits(i + 1)}. {label}
          </li>
        ))}
      </ol>

      {error && <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}

      {step === 0 && (
        <section className="mt-8 flex flex-col gap-5">
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-dim">عنوان نبرد</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="مثلاً: بهترین کمدی‌های دههٔ ۹۰" className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-dim">توضیح (اختیاری)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} className={FIELD} />
          </label>
          <div>
            <span className="mb-1.5 block text-sm text-ink-dim">نوع گزینه‌ها (همه از یک نوع)</span>
            <div className="flex gap-2">
              {(Object.keys(ENTITY_TYPE_LABELS) as TournamentEntityType[]).map((t) => (
                <Choice key={t} active={entityType === t} onClick={() => setEntityType(t)}>
                  {ENTITY_TYPE_LABELS[t]}
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm text-ink-dim">اندازهٔ استخر</span>
            <div className="flex gap-2">
              {SIZES.map((s) => (
                <Choice key={s} active={size === s} onClick={() => setSize(s)}>
                  {toFaDigits(s)} گزینه
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <button
              type="button"
              disabled={busy || title.trim().length < 3}
              onClick={saveInfo}
              className="rounded-xl bg-gold px-6 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
            >
              {busy ? "در حال ذخیره…" : "مرحلهٔ بعد"}
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="mt-8 flex flex-col gap-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">
                گزینه‌ها <span className="num text-gold">{toFaDigits(entries.length)}/{toFaDigits(size)}</span>
              </h2>
              <p className="text-xs text-muted">ترتیب هر بار بازی تصادفی است.</p>
            </div>
            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">هنوز گزینه‌ای اضافه نشده.</p>
            ) : (
              <ol className="grid gap-2 sm:grid-cols-2">
                {entries.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2">
                    <span className="num w-6 text-center text-sm text-gold">{toFaDigits(i + 1)}</span>
                    <Poster entity={e} size="w185" className="w-10 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{displayTitle(e)}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="بالا" className="px-1 text-muted hover:text-ink disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === entries.length - 1} aria-label="پایین" className="px-1 text-muted hover:text-ink disabled:opacity-30">▼</button>
                    <button type="button" onClick={() => setEntries((p) => p.filter((x) => x.id !== e.id))} aria-label="حذف" className="px-1 text-muted hover:text-red-400">✕</button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <EntryPicker entityType={entityType} selectedIds={entries.map((e) => e.id)} full={full} onAdd={add} onAddMany={addMany} />

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} className="rounded-xl border border-border px-5 py-2.5 text-sm text-ink-dim">قبلی</button>
            <button
              type="button"
              disabled={busy || entries.length !== size}
              onClick={saveEntries}
              className="rounded-xl bg-gold px-6 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
            >
              {busy ? "در حال ذخیره…" : entries.length === size ? "مرحلهٔ بعد" : `${toFaDigits(size - entries.length)} گزینهٔ دیگر لازم است`}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8 flex flex-col gap-6">
          <div>
            <span className="mb-1.5 block text-sm text-ink-dim">دسترسی</span>
            <div className="flex gap-2">
              <Choice active={visibility === "public"} onClick={() => setVisibility("public")}>عمومی (در فهرست نبردها)</Choice>
              <Choice active={visibility === "unlisted"} onClick={() => setVisibility("unlisted")}>فقط با لینک</Choice>
            </div>
          </div>
          <p className="text-xs text-muted">همه می‌توانند این استخر را «برنده می‌ماند» بازی کنند و نتیجهٔ جمعی را ببینند. بعد از انتشار، گزینه‌ها قابل تغییر نیستند.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-border px-5 py-2.5 text-sm text-ink-dim">قبلی</button>
            <button type="button" disabled={busy} onClick={publish} className="rounded-xl bg-gold px-6 py-2.5 text-sm font-bold text-bg disabled:opacity-50">
              {busy ? "در حال انتشار…" : "انتشار نبرد"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
