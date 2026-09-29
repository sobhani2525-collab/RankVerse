"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MonoLabel } from "@/components/list-detail/ui";

export interface FilterSelect {
  label: string;
  // Small mono caption shown in the panel header (e.g. "GENRE").
  en: string;
  value: string;
  // [optionValue, optionLabel, href]
  options: readonly (readonly [string, string, string])[];
}

/** Popover dropdown in the same shell as AddToListMenu: rounded panel,
 *  mono caption header, 44px rows with a teal check on the active one. */
function Dropdown({ sel }: { sel: FilterSelect }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = sel.options.find(([v]) => v === sel.value) ?? sel.options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 items-center gap-2 rounded-xl border bg-surface px-3.5 text-sm transition hover:border-gold/40 ${
          open ? "border-gold/40" : "border-border"
        }`}
      >
        <span className="text-muted">{sel.label}</span>
        <span className="font-bold text-ink">{current[1]}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted transition ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2.5">
            <MonoLabel size="text-[10px]" className="text-dim">
              {sel.en}
            </MonoLabel>
            <span className="text-xs text-muted">{sel.label.replace(/:$/, "")}</span>
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto">
            {sel.options.map(([v, label, href]) => {
              const active = v === sel.value;
              return (
                <button
                  key={v}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    if (!active) router.push(href);
                  }}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 text-start text-sm text-ink transition hover:bg-surface-2"
                >
                  <span className="truncate">{label}</span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition ${
                      active ? "border-teal bg-teal/15 text-teal" : "border-border text-transparent"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RankingFilters({ selects }: { selects: FilterSelect[] }) {
  return (
    <>
      {selects.map((sel) => (
        <Dropdown key={sel.en} sel={sel} />
      ))}
    </>
  );
}
