"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { changeMyPassword, deleteMyAccount } from "@/lib/api";

const MIN_PASSWORD = 8;
const field = "w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50";

/** Password change and account deletion for the signed-in user (opened from the profile header). */
export default function AccountSettings() {
  return (
    <div className="mt-8 grid max-w-2xl gap-6">
      <ChangePasswordForm />
      <DeleteAccountForm />
    </div>
  );
}

function ChangePasswordForm() {
  const { getToken, adoptTokens } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setDone(false);
    if (next.length < MIN_PASSWORD) return setError("رمز جدید دست‌کم ۸ نویسه باشد.");
    if (next !== repeat) return setError("تکرار رمز جدید با خود رمز یکی نیست.");
    setBusy(true);
    setError(null);
    try {
      // Changing the password ends every other session; this device continues on the new pair.
      adoptTokens(await changeMyPassword(token, current, next));
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تغییر رمز ممکن نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-surface/60 p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink">تغییر رمز عبور</h2>
      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="acc-current" className="mb-1 block text-sm text-muted">رمز فعلی</label>
          <input id="acc-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} dir="ltr" />
        </div>
        <div>
          <label htmlFor="acc-new" className="mb-1 block text-sm text-muted">رمز جدید</label>
          <input id="acc-new" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} className={field} dir="ltr" />
        </div>
        <div>
          <label htmlFor="acc-repeat" className="mb-1 block text-sm text-muted">تکرار رمز جدید</label>
          <input id="acc-repeat" type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field} dir="ltr" />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">{error}</p>
      )}
      {done && (
        <p role="status" className="mt-4 rounded-lg border border-teal/30 bg-teal/5 px-4 py-2 text-sm text-teal">رمز عبور تغییر کرد.</p>
      )}
      <button type="submit" disabled={busy} className="mt-5 rounded-lg bg-gold px-5 py-2 text-sm font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50">
        {busy ? "در حال ذخیره…" : "تغییر رمز"}
      </button>
    </form>
  );
}

function DeleteAccountForm() {
  const router = useRouter();
  const { getToken, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(token, password);
      logout();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف حساب ممکن نشد");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink">حذف حساب</h2>
      <p className="mt-2 text-sm leading-7 text-muted">
        با حذف حساب، ایمیل، نام کاربری، نام نمایشی و بیوی تو پاک می‌شود و دیگر نمی‌توانی وارد شوی. این کار برگشت‌پذیر نیست.
        فهرست‌های خصوصی و «تماشا خواهم کرد» هم پاک می‌شوند. امتیازها، رأی‌های نبرد، نظرها و فهرست‌های عمومی‌ات بدون نام تو باقی می‌مانند.
      </p>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="mt-4 rounded-lg border border-red-500/50 px-5 py-2 text-sm text-red-400 transition hover:bg-red-500/10">
          حذف حساب من
        </button>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <label htmlFor="acc-delete-password" className="mb-1 block text-sm text-muted">برای تأیید، رمز عبورت را وارد کن</label>
          <input id="acc-delete-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} dir="ltr" />
          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">{error}</p>
          )}
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={busy || !password} className="rounded-lg bg-red-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-500/90 disabled:opacity-50">
              {busy ? "در حال حذف…" : "حذف همیشگی حساب"}
            </button>
            <button type="button" onClick={() => { setConfirming(false); setPassword(""); setError(null); }} className="rounded-lg border border-border px-5 py-2 text-sm text-muted transition hover:text-ink">
              انصراف
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
