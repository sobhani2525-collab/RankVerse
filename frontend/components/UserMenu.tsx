"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Round avatar (username initial) that opens the signed-in user's menu.
// Closes on outside click, Escape, or choosing an item.
export default function UserMenu({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const itemClass = "block w-full px-4 py-2 text-right text-sm text-ink transition hover:bg-surface2";

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="منوی کاربر"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-surface2 text-sm font-bold uppercase text-gold transition hover:border-gold"
      >
        {username.charAt(0)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <div className="truncate border-b border-border px-4 py-2 text-xs text-muted">{username}</div>
          <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            پروفایل من
          </Link>
          <Link
            href={`/profile/${encodeURIComponent(username)}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            صفحه‌ی عمومی من
          </Link>
          <Link href="/lists/new" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            ساخت لیست جدید
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={`${itemClass} border-t border-border text-red-400`}
          >
            خروج
          </button>
        </div>
      )}
    </div>
  );
}
