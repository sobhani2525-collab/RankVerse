"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface Props {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  /** Ask for a free-text reason (required, trimmed, passed to onConfirm). */
  reason?: { label: string; maxLength?: number };
  /** The admin must type this exact text before confirming. */
  requireText?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const input = "mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

export function ConfirmDialog({ title, description, confirmLabel, danger, busy, reason, requireText, onConfirm, onCancel }: Props) {
  const [reasonText, setReasonText] = useState("");
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const reasonRef = useRef<HTMLInputElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancelHandler = useRef(onCancel);
  cancelHandler.current = onCancel;

  useEffect(() => {
    (reasonRef.current ?? typedRef.current ?? cancelRef.current)?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && cancelHandler.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy]);

  const ready = (!reason || reasonText.trim().length > 0) && (!requireText || typed === requireText);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) onConfirm(reasonText.trim());
        }}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-bold text-ink">
          {title}
        </h2>
        {description && <div className="mt-2 text-sm leading-6 text-muted">{description}</div>}
        {reason && (
          <label className="mt-4 block text-sm text-muted">
            {reason.label}
            <input ref={reasonRef} value={reasonText} maxLength={reason.maxLength ?? 300} onChange={(e) => setReasonText(e.target.value)} className={input} />
          </label>
        )}
        {requireText && (
          <label className="mt-4 block text-sm text-muted">
            برای تأیید، <bdi className="font-bold text-ink">{requireText}</bdi> را تایپ کنید
            <input ref={typedRef} dir="ltr" value={typed} onChange={(e) => setTyped(e.target.value)} className={input} />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-ink disabled:opacity-40">
            انصراف
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className={`rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-40 ${
              danger ? "border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20" : "border-gold/50 bg-gold/10 text-gold hover:bg-gold/20"
            }`}
          >
            {busy ? "در حال انجام…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
