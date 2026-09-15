"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary -- only the inner component
  // actually reads it.
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm px-6 py-14 text-center text-muted">در حال بارگذاری…</div>}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("لینک بازیابی نامعتبر است. لینک را دوباره از ایمیل خود باز کنید.");
      return;
    }
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد");
      return;
    }
    if (password !== confirmPassword) {
      setError("رمز عبور و تکرار آن یکسان نیستند");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در بازیابی رمز عبور");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-14 text-center">
        <h1 className="text-2xl font-bold text-ink">رمز عبور تغییر کرد</h1>
        <p className="mt-2 text-sm text-muted">
          حالا می‌توانید با رمز عبور جدید وارد حساب‌تان شوید.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-8 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90"
        >
          ورود به حساب
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">تعیین رمز عبور جدید</h1>

      {!token && (
        <p className="mt-4 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-center text-sm text-gold">
          این لینک نامعتبر است. لینک بازیابی را دوباره از ایمیل خود باز کنید.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-muted">رمز عبور جدید</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted">تکرار رمز عبور جدید</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !token}
          className="mt-2 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
        >
          {loading ? "در حال ثبت..." : "ثبت رمز عبور جدید"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/forgot-password" className="text-teal hover:underline">
          درخواست لینک جدید
        </Link>
      </p>
    </main>
  );
}
