"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ورود");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">ورود به RankVerse</h1>
      <p className="mt-2 text-center text-sm text-muted">
        برای رای‌دادن به فیلم‌ها وارد حساب خود شوید
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
        <div>
          <label className="mb-1 block text-sm text-muted">رمز عبور</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          disabled={loading}
          className="mt-2 rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
        >
          {loading ? "در حال ورود..." : "ورود"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        حساب ندارید؟{" "}
        <Link href="/register" className="text-teal hover:underline">
          ثبت‌نام کنید
        </Link>
      </p>
    </main>
  );
}
