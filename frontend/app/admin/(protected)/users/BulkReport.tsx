"use client";
import { useEffect, useRef } from "react";
import { toFaDigits } from "@/lib/format-number";
import type { BulkResult } from "./bulk";

/** Outcome of a bulk run: counts plus the reason each failed row failed. */
export function BulkReport({
  title,
  result,
  nameOf,
  onClose,
}: {
  title: string;
  result: BulkResult;
  nameOf: (id: string) => string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stat = (label: string, n: number, cls: string) => (
    <div className="rounded-lg border border-border bg-bg p-3 text-center">
      <div className={`num text-xl font-bold ${cls}`}>{toFaDigits(n)}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stat("موفق", result.succeeded.length, "text-teal")}
          {stat("ناموفق", result.failed.length, result.failed.length ? "text-red-400" : "text-muted")}
          {stat("بدون تغییر", result.skipped.length, "text-muted")}
        </div>
        {result.skipped.length > 0 && <p className="mt-3 text-xs text-muted">«بدون تغییر» یعنی کاربر از قبل در همین وضعیت بوده است.</p>}
        {result.failed.length > 0 && (
          <ul className="mt-3 max-h-48 space-y-1.5 overflow-auto text-sm">
            {result.failed.map((f) => (
              <li key={f.id} className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5">
                <bdi className="font-bold text-ink">{nameOf(f.id)}</bdi>
                <span className="text-red-300"> — {f.reason}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end">
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-ink hover:border-gold/40">
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
