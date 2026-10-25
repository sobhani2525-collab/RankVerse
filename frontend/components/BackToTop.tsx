"use client";

import { useEffect, useState } from "react";

/** How far down (px) the page must scroll before the button shows. */
const SHOW_AFTER = 600;

/** Floating "back to top" button, bottom corner; appears once the page is scrolled. */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="بازگشت به بالا"
      title="بازگشت به بالا"
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-[#0A0F18]/75 text-gold shadow-lg shadow-black/40 backdrop-blur-md transition duration-300 hover:border-gold hover:bg-gold hover:text-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold lg:bottom-8 lg:left-8 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
