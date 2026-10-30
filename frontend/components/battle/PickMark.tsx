"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PickPhase = "loading" | "done";

const LOADING_MIN_MS = 350;
const CHECK_HOLD_MS = 550;

/**
 * Overlay for the chosen battle option: the gold spinner of the galaxy
 * explorer while the pick is being saved, then a big gold check.
 */
export function PickMark({ phase, small = false }: { phase: PickPhase | null; small?: boolean }) {
  if (!phase) return null;
  return (
    <span
      role="status"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#070A12]/55 backdrop-blur-[2px]"
    >
      {phase === "loading" ? (
        <span className={`${small ? "h-6 w-6" : "h-10 w-10"} animate-spin rounded-full border-2 border-gold/30 border-t-gold`} aria-label="در حال ثبت" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className={`battle-pick-pop ${small ? "h-10 w-10" : "h-20 w-20"} text-gold drop-shadow-[0_0_14px_rgba(232,179,74,0.6)]`} aria-label="انتخاب شد">
          <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 12.5l3.2 3.2L17 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/**
 * Drives the pick animation for "winner stays" runs: spinner while `request`
 * is in flight (at least a beat), then the gold check, then `advance()`.
 * Further clicks are ignored while a pick is playing.
 */
export function useBattlePick<S extends string>() {
  const [picked, setPicked] = useState<S | null>(null);
  const [phase, setPhase] = useState<PickPhase | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback((side: S, request: Promise<unknown> | null, advance: () => void) => {
    if (busy.current) return;
    busy.current = true;
    setPicked(side);
    setPhase("loading");
    const wait = new Promise((r) => setTimeout(r, LOADING_MIN_MS));
    void Promise.all([request ? request.catch(() => undefined) : null, wait]).then(() => {
      if (!mounted.current) return;
      setPhase("done");
      setTimeout(() => {
        busy.current = false;
        if (!mounted.current) return;
        setPicked(null);
        setPhase(null);
        advance();
      }, CHECK_HOLD_MS);
    });
  }, []);

  return { picked, phase, start, busy: phase !== null };
}
