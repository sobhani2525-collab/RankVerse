
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, username, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت‌نام");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">ساخت حساب در RankVerse</h1>
      <p className="mt-2 text-center text-sm text-muted">
        به جمع رتبه‌دهندگان RankVerse بپیوندید
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm text-muted">نام کاربری</label>
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            dir="ltr"
          />
        </div>
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
            minLength={8}
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
          {loading ? "در حال ساخت حساب..." : "ثبت‌نام"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        قبلاً حساب ساخته‌اید؟{" "}
        <Link href="/login" className="text-teal hover:underline">
          وارد شوید
        </Link>
      </p>
    </main>
  );
}
