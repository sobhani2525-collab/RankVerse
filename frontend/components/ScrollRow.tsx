"use client";

import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

type Props = {
  as?: ElementType;
  className?: string;
  /** Visibility classes for the arrows, e.g. "sm:hidden" when the row turns into a grid. */
  arrowClassName?: string;
  children: ReactNode;
};

// Horizontal scroller with left/right arrow buttons. Works in RTL (scrollLeft is
// negative there), so position is judged by distance from both edges.
export default function ScrollRow({ as: Tag = "div", className = "", arrowClassName = "", children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    const atStart = pos < 4;
    const atEnd = pos > max - 4;
    const rtl = getComputedStyle(el).direction === "rtl";
    // In RTL the start edge is the right side, so "left" means towards the end.
    setCanLeft(max > 4 && (rtl ? !atEnd : !atStart));
    setCanRight(max > 4 && (rtl ? !atStart : !atEnd));
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const btn =
    "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#05070D]/85 text-lg text-ink shadow-lg backdrop-blur transition hover:border-gold/40 hover:text-gold";

  return (
    <div className="relative">
      <Tag ref={ref} onScroll={update} className={className}>
        {children}
      </Tag>
      {canLeft && (
        <button type="button" aria-label="اسکرول به چپ" onClick={() => scrollBy(-1)} className={`${btn} left-2 ${arrowClassName}`}>
          ‹
        </button>
      )}
      {canRight && (
        <button type="button" aria-label="اسکرول به راست" onClick={() => scrollBy(1)} className={`${btn} right-2 ${arrowClassName}`}>
          ›
        </button>
      )}
    </div>
  );
}
