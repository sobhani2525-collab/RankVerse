"use client";
import { useEffect, useState } from "react";
import { toFaDigits } from "@/lib/format-number";

export interface ExportChoice {
  format: "csv" | "json";
  scope: "selected" | "all";
}

export function ExportDialog({
  selectedCount,
  selectedDisabledReason,
  resultCount,
  busy,
  onConfirm,
  onCancel,
}: {
  /** 0 hides nothing but disables the "selected only" option. */
  selectedCount: number;
  selectedDisabledReason?: string;
  resultCount: number;
  busy: boolean;
  onConfirm: (choice: ExportChoice) => void;
  onCancel: () => void;
}) {
  const canUseSelected = selectedCount > 0 && !selectedDisabledReason;
  const [format, setFormat] = useState<ExportChoice["format"]>("csv");
  const [scope, setScope] = useState<ExportChoice["scope"]>(canUseSelected ? "selected" : "all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const radio = "flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm has-[:checked]:border-gold/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="خروجی گرفتن از کاربران"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onConfirm({ format, scope });
        }}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
      >
        <h2 className="text-base font-bold text-ink">خروجی گرفتن از کاربران</h2>

        <fieldset className="mt-4 space-y-2">
          <legend className="mb-1 text-xs text-muted">چه کسانی؟</legend>
          <label className={radio}>
            <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} className="mt-1" />
            <span>
              همهٔ نتایج فعلی <span className="num text-muted">({toFaDigits(resultCount)} کاربر)</span>
            </span>
          </label>
          <label className={`${radio} ${canUseSelected ? "" : "opacity-50"}`}>
            <input type="radio" name="scope" disabled={!canUseSelected} checked={scope === "selected"} onChange={() => setScope("selected")} className="mt-1" />
            <span>
              فقط انتخاب‌شده‌ها <span className="num text-muted">({toFaDigits(selectedCount)})</span>
              {selectedDisabledReason && <span className="block text-xs text-gold">{selectedDisabledReason}</span>}
            </span>
          </label>
        </fieldset>

        <fieldset className="mt-4 flex gap-2">
          <legend className="mb-1 text-xs text-muted">قالب</legend>
          {(["csv", "json"] as const).map((f) => (
            <label key={f} className={`${radio} flex-1`}>
              <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} className="mt-1" />
              <span dir="ltr">{f.toUpperCase()}</span>
            </label>
          ))}
        </fieldset>

        <p className="mt-3 text-xs leading-6 text-muted">فایل CSV با UTF-8 (BOM) ساخته می‌شود تا فارسی در Excel درست باز شود. هر خروجی در تاریخچهٔ مدیریتی ثبت می‌شود.</p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-ink disabled:opacity-40">انصراف</button>
          <button type="submit" disabled={busy} className="rounded-lg border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-bold text-gold hover:bg-gold/20 disabled:opacity-40">
            {busy ? "در حال آماده‌سازی…" : "دانلود"}
          </button>
        </div>
      </form>
    </div>
  );
}
