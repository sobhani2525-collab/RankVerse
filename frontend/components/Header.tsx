"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import SearchBox from "@/components/SearchBox";
import UserMenu from "@/components/UserMenu";

const NAV_LINKS = [
  { href: "/#universe", label: "کاوش", match: null },
  { href: "/rankings", label: "فیلم‌ها", match: null },
  { href: "/rankings?type=tv_series", label: "سریال‌ها", match: null },
  { href: "/people", label: "هنرمندان", match: "/people" },
  { href: "/lists", label: "فهرست‌ها", match: "/lists" },
  { href: "/battles", label: "نبرد بهترین‌ها", match: "/battles", accent: true },
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

  // "/battles" also prefixes "/battles/daily", which has its own link.
  const isActive = (match: string | null) =>
    !!match && !!pathname?.startsWith(match) && (match !== "/battles" || !pathname.startsWith("/battles/daily"));

  return (
    <header className="relative z-40 border-b border-border bg-surface px-4 py-[16.5px] sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-2 gap-y-3 sm:gap-x-4 md:flex-nowrap">
        <Link href="/" aria-label="سینماگزین" className="shrink-0">
          <Image
            src="/brand-logo.png"
            alt="سینماگزین"
            width={454}
            height={160}
            priority
            className="h-11 w-auto md:h-12"
          />
        </Link>

        <nav aria-label="ناوبری اصلی" className="hidden shrink-0 items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              aria-current={isActive(l.match) ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                l.accent
                  ? `font-bold text-violet-light hover:bg-violet-light/10 ${isActive(l.match) ? "bg-violet-light/15" : "bg-violet-light/5"}`
                  : isActive(l.match) ? "bg-gold/10 text-gold" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Below md the box drops to its own full-width row. */}
        <SearchBox className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "بستن منو" : "باز کردن منو"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-ink transition hover:border-gold/40 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>

          <div className="flex h-9 items-center">
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
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          aria-label="ناوبری اصلی"
          className="absolute inset-x-0 top-full border-b border-border bg-surface px-4 py-3 shadow-2xl shadow-black/50 md:hidden"
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(l.match) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-3 text-base transition ${
                    l.accent
                      ? "bg-violet-light/5 font-bold text-violet-light"
                      : isActive(l.match) ? "bg-gold/10 text-gold" : "text-ink hover:bg-surface2"
                  }`}
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
