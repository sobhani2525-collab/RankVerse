"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ToastInput {
  text: string;
  ok?: boolean;
  /** Optional one-click action, e.g. "بازگشت" (undo). */
  action?: { label: string; run: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-3), { ...t, id }]);
      timers.current.push(window.setTimeout(() => dismiss(id), t.action ? 8000 : 4500));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 start-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.ok === false ? "border-red-500/40 bg-surface text-red-300" : "border-teal/40 bg-surface text-teal"
            }`}
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
                className="rounded border border-current px-2 py-0.5 text-xs font-bold hover:bg-white/5"
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="بستن" onClick={() => dismiss(t.id)} className="text-muted hover:text-ink">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
