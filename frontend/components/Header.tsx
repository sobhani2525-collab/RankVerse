"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import SearchBox from "@/components/SearchBox";
import UserMenu from "@/components/UserMenu";

export default function Header() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { openLoginModal } = useAuthGate();
  return (
    <header className="border-b border-border bg-surface px-6 py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link href="/" className="shrink-0 font-display text-lg text-ink">
          RankVerse
        </Link>

        <SearchBox />

        <div className="flex h-9 shrink-0 items-center">
          {!loading &&
            (isAuthenticated && user ? (
              <UserMenu username={user.username} onLogout={logout} />
            ) : (
              // The login modal links to /register, so one button covers both.
              <button onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">
                ورود / ثبت‌نام
              </button>
            ))}
        </div>
      </div>
    </header>
  );
}
