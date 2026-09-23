"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import SearchBox from "@/components/SearchBox";
import UserMenu from "@/components/UserMenu";

const NAV_LINKS = [
  { href: "/#universe", label: "کاوش", match: null },
  { href: "/rankings", label: "رتبه‌بندی", match: "/rankings" },
  { href: "/battles", label: "نبرد", match: "/battles" },
  { href: "/lists", label: "لیست‌ها", match: "/lists" },
];

export default function Header() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { openLoginModal } = useAuthGate();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const isActive = (match: string | null) => !!match && !!pathname?.startsWith(match);

  return (
    <header className="relative z-40 border-b border-border bg-surface px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4">
        <Link href="/" className="shrink-0 font-display text-lg text-ink">
          RankVerse
        </Link>

        <nav aria-label="ناوبری اصلی" className="hidden shrink-0 items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.match) ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${isActive(l.match) ? "bg-gold/10 text-gold" : "text-muted hover:text-ink"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <SearchBox />

        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "بستن منو" : "باز کردن منو"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-ink transition hover:border-gold/40 md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>

        <div className="flex h-9 shrink-0 items-center">
          {!loading &&
            (isAuthenticated && user ? (
              <UserMenu username={user.username} onLogout={logout} />
            ) : (
              // The login modal links to /register, so one button covers both.
              <button onClick={openLoginModal} className="btn-primary whitespace-nowrap text-sm hover:opacity-90">
                ورود / ثبت‌نام
              </button>
            ))}
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="ناوبری اصلی"
          className="absolute inset-x-0 top-full border-b border-border bg-surface px-4 py-3 shadow-2xl shadow-black/50 md:hidden"
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(l.match) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-3 text-base transition ${isActive(l.match) ? "bg-gold/10 text-gold" : "text-ink hover:bg-surface2"}`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
