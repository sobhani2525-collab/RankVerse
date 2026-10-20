"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { TournamentDetail, tournamentApi } from "@/lib/tournament";

const FIELD = "w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-ink outline-none focus:border-gold/60";
const BTN = "rounded-lg border border-border px-3 py-1.5 text-sm text-ink-dim transition hover:text-ink disabled:opacity-50";

/** The creator's controls on a battle page: edit text, extend/close the round, finish, visibility, delete. */
export default function OwnerPanel({ battle, onChange }: { battle: TournamentDetail; onChange: (b: TournamentDetail) => void }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [title, setTitle] = useState(battle.title);
  const [description, setDescription] = useState(battle.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const active = battle.status === "active";
  const editable = battle.status !== "archived";

  async function run(action: (token: string) => Promise<TournamentDetail | void>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await action(token);
      if (next) onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setBusy(false);
    }
  }

  if (!editable) return null;

  return (
    <details className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-bold text-gold">مدیریت نبرد</summary>
      <div className="mt-4 flex flex-col gap-5">
        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={FIELD} aria-label="عنوان" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} className={FIELD} aria-label="توضیح" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy || title.trim().length < 3}
              className={BTN}
              onClick={() =>
                run(async (t) => {
                  const next = await tournamentApi.update(t, battle.slug, { title, description });
                  setSaved(true);
                  return next;
                })
              }
            >
              ذخیرهٔ عنوان و توضیح
            </button>
            {saved && <span className="text-xs text-teal">ذخیره شد</span>}
          </div>
        </div>

        {active && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">تمدید دور جاری:</span>
            {[
              ["۱ ساعت", 3600],
              ["۶ ساعت", 6 * 3600],
              ["۲۴ ساعت", 24 * 3600],
            ].map(([label, secs]) => (
              <button key={label} type="button" disabled={busy} className={BTN} onClick={() => run((t) => tournamentApi.extend(t, battle.slug, secs as number))}>
                + {label}
              </button>
            ))}
          </div>
        )}

        {active && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className={BTN}
              onClick={() => run((t) => tournamentApi.closeRound(t, battle.slug), "دور جاری همین حالا بسته شود؟")}
            >
              بستن دور جاری
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${BTN} hover:text-red-300`}
              onClick={() =>
                run(
                  (t) => tournamentApi.finish(t, battle.slug),
                  "کل نبرد پایان یابد؟ مسابقه‌های باقی‌مانده با آرای فعلی بسته می‌شوند و دورهای بعد (بدون رأی) به نفع seed بالاتر می‌روند."
                )
              }
            >
              پایان دادن به نبرد
            </button>
          </div>
        )}

        {battle.status !== "draft" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">دسترسی:</span>
            {(["public", "unlisted"] as const).map((v) => (
              <button
                key={v}
                type="button"
                disabled={busy || battle.visibility === v}
                className={`${BTN} ${battle.visibility === v ? "border-gold text-gold" : ""}`}
                onClick={() => run((t) => tournamentApi.setVisibility(t, battle.slug, v))}
              >
                {v === "public" ? "عمومی" : "فقط با لینک"}
              </button>
            ))}
          </div>
        )}

        <div>
          <button
            type="button"
            disabled={busy}
            className={`${BTN} border-red-500/40 text-red-300`}
            onClick={() =>
              run(
                async (t) => {
                  await tournamentApi.remove(t, battle.slug);
                  router.push("/battles/mine");
                },
                battle.status === "draft"
                  ? "پیش‌نویس برای همیشه حذف شود؟"
                  : "نبرد از فهرست‌ها برداشته شود؟ لینک و نتایج باقی می‌مانند."
              )
            }
          >
            {battle.status === "draft" ? "حذف پیش‌نویس" : "بایگانی نبرد"}
          </button>
        </div>
      </div>
    </details>
  );
}
