"use client";
import { useState, type KeyboardEvent } from "react";
import { toFaDigits } from "@/lib/format-number";
import { LIST_FIELD } from "@/components/form-styles";

const MAX_TAGS = 8;

// One-tap starters so nobody has to guess what a tag looks like.
const SUGGESTED_TAGS = ["اکشن", "درام", "کمدی", "علمی‌تخیلی", "ترسناک", "انیمه", "کلاسیک", "خانوادگی"];

/**
 * Tag input: type a word and press the "+" button (or Enter/comma) to add it
 * as a removable pill, or tap one of the suggested tags below. Backspace on
 * an empty draft pops the last tag.
 */
export default function TagComposer({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS;

  function add(raw: string) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || tags.includes(tag) || full) return;
    onChange([...tags, tag]);
  }

  function commitDraft() {
    add(draft);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  const suggestions = SUGGESTED_TAGS.filter((t) => !tags.includes(t));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="text-sm text-ink-dim">برچسب‌ها</span>
        <span className="num">
          {toFaDigits(tags.length)}/{toFaDigits(MAX_TAGS)}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gold bg-gold/10 py-1.5 pe-1.5 ps-3 text-[13px] text-gold"
            >
              #{tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`حذف برچسب ${tag}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-gold/70 transition hover:bg-gold/20 hover:text-gold"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!full && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="برچسب دلخواه را بنویسید…"
            className={`${LIST_FIELD} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={commitDraft}
            disabled={!draft.trim()}
            className="shrink-0 rounded-lg border border-border px-4 text-sm text-ink-dim transition hover:border-gold/60 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
          >
            افزودن
          </button>
        </div>
      )}

      {!full && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-dim">پیشنهاد:</span>
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-xl border border-border px-3 py-1.5 text-[13px] text-muted transition hover:border-gold/60 hover:text-ink"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-dim">
        برچسب‌ها به پیدا شدن فهرست کمک می‌کنند. با دکمهٔ «افزودن» یا کلید Enter ثبت می‌شوند.
      </p>
    </div>
  );
}
