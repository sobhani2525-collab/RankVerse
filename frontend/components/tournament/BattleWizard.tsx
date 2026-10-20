"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
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

const STEPS = ["اطلاعات اولیه", "افزودن گزینه‌ها"];
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

  const publish = () =>
    run(async (token) => {
      await tournamentApi.setEntries(token, slug!, entries.map((e) => e.id));
      await tournamentApi.publish(token, slug!, { visibility: "public" });
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
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display text-3xl text-ink">ساخت نبرد جدید</h1>
      <p className="mt-2 text-sm text-muted">بازی به روش «برنده می‌ماند»؛ گزینه‌ها را اضافه کن و نبرد را منتشر کن.</p>
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
            <span className="mb-1.5 block text-sm text-ink-dim">نوع گزینه‌ها</span>
            <div className="flex gap-2">
              {(Object.keys(ENTITY_TYPE_LABELS) as TournamentEntityType[]).map((t) => (
                <Choice key={t} active={entityType === t} onClick={() => setEntityType(t)}>
                  {ENTITY_TYPE_LABELS[t]}
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm text-ink-dim">تعداد گزینه‌ها</span>
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
              <p className="text-xs text-muted">ترتیب مهم نیست؛ هر بار بازی تصادفی است.</p>
            </div>
            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">هنوز گزینه‌ای اضافه نشده.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {entries.map((e) => (
                  <li key={e.id} className="min-w-0">
                    <div className="relative">
                      <Poster entity={e} size="w342" className="w-full" />
                      <button
                        type="button"
                        onClick={() => setEntries((p) => p.filter((x) => x.id !== e.id))}
                        aria-label="حذف"
                        className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg/85 text-sm text-ink-dim transition hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="px-0.5 pt-2">
                      <p className="line-clamp-1 text-sm font-bold text-ink">{e.title_fa || e.title}</p>
                      {e.title_fa && (
                        <p className="line-clamp-1 text-right text-xs text-ink-dim" dir="ltr">
                          {e.title}
                        </p>
                      )}
                      {e.year ? <p className="num text-right text-xs text-muted" dir="rtl">{toFaDigits(e.year)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <EntryPicker entityType={entityType} selectedIds={entries.map((e) => e.id)} full={full} onAdd={add} onAddMany={addMany} />

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(0)} className="rounded-xl border border-border px-5 py-2.5 text-sm text-ink-dim">قبلی</button>
            <button
              type="button"
              disabled={busy || entries.length !== size}
              onClick={publish}
              className="rounded-xl bg-gold px-6 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
            >
              {busy ? "در حال انتشار…" : entries.length === size ? "انتشار نبرد" : `${toFaDigits(size - entries.length)} گزینهٔ دیگر لازم است`}
            </button>
          </div>
          <p className="text-sm text-muted">بعد از انتشار، گزینه‌ها قابل تغییر نیستند.</p>
        </section>
      )}

    </main>
  );
}
