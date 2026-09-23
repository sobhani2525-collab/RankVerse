"use client";

import { RefObject, useEffect, useRef, useState } from "react";

/**
 * True once the element has scrolled within `rootMargin` of the viewport,
 * and stays true afterwards (it's used to defer a fetch or start a reveal
 * animation once, not to track visibility continuously).
 */
export function useInView<T extends Element>(rootMargin = "0px 0px -10% 0px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}
