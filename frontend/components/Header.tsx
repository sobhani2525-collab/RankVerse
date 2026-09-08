"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import SearchBox from "@/components/SearchBox";

export default function Header() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-black text-ink">
            RankVerse
          </Link>
          <Link href="/battles" className="text-sm text-muted transition hover:text-gold">
            نبرد بهترین‌ها
          </Link>
        </div>

        <SearchBox />

        {!loading && (
          <div className="flex shrink-0 items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link href="/profile" className="text-sm text-muted hover:text-gold">
                  {user?.username}
                </Link>
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