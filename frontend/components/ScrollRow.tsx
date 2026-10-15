"use client";

import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type Props = {
  as?: ElementType;
  className?: string;
  /** Visibility classes for the arrow, e.g. "sm:hidden" when the row turns into a grid. */
  arrowClassName?: string;
  children: ReactNode;
};

// Horizontal scroller with a single left-arrow hint (the page is RTL, so more
// items hide off the left edge). The arrow fades out once the user scrolls.
export default function ScrollRow({ as: Tag = "div", className = "", arrowClassName = "", children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 8;
    setVisible(overflow && Math.abs(el.scrollLeft) < 24);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const scrollLeft = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: -el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <Tag ref={ref} onScroll={update} className={className}>
        {children}
      </Tag>
      <button
        type="button"
        aria-label="مشاهدهٔ آیتم‌های بیشتر"
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        onClick={scrollLeft}
        className={`absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[#05070D]/70 text-ink shadow-[0_6px_20px_rgba(0,0,0,0.55)] backdrop-blur-md transition-opacity duration-300 hover:border-gold/40 hover:text-gold ${
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        } ${arrowClassName}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
    </div>
  );
}
