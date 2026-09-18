"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import SearchBox from "@/components/SearchBox";

export default function Header() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { openLoginModal } = useAuthGate();
  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-lg text-ink">
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
                <button
                  onClick={openLoginModal}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink transition hover:border-gold/50"
                >
                  ورود
                </button>
                <Link href="/register" className="btn-primary text-sm hover:opacity-90">
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