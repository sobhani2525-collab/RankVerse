"use client";
import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDevResetLink(null);
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setMessage(res.message);
      // Dev-only convenience until a real email provider is wired up on
      // the backend -- see UserService.request_password_reset.
      if (res.dev_reset_link) setDevResetLink(res.dev_reset_link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ارسال درخواست");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">فراموشی رمز عبور</h1>
      <p className="mt-2 text-center text-sm text-muted">
        ایمیل حساب‌تان را وارد کنید تا لینک بازیابی رمز عبور برایتان ارسال شود
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-muted">ایمیل</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
            {error}
          </p>
        )}

        {message && (
          <p className="rounded-lg border border-teal/30 bg-teal/5 px-4 py-2 text-sm text-teal">
            {message}
          </p>
        )}

        {devResetLink && (
          <div className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm">
            <p className="mb-1 text-muted">
              هنوز سرویس ایمیل واقعی وصل نشده — فعلاً لینک بازیابی برای تست اینجا نمایش داده می‌شود:
            </p>
            <Link href={devResetLink} className="break-all text-teal hover:underline" dir="ltr">
              {devResetLink}
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
        >
          {loading ? "در حال ارسال..." : "ارسال لینک بازیابی"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="text-teal hover:underline">
          بازگشت به ورود
        </Link>
      </p>
    </main>
  );
}
