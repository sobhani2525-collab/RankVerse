"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function Header() {
  const { user, isAuthenticated, loading, logout } = useAuth();

  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <Link href="/" className="text-lg font-black text-ink">
          RankVerse
        </Link>

        {!loading && (
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-muted">{user?.username}</span>
                <button
                  onClick={logout}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink transition hover:border-gold/50"
                >
                  خروج
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink transition hover:border-gold/50"
                >
                  ورود
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-gold px-3 py-1.5 text-sm font-bold text-bg transition hover:bg-gold/90"
                >
                  ثبت‌نام
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
