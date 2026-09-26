"use client";
import { useState, type KeyboardEvent } from "react";

const MAX_TAGS = 8;

/**
 * Chip-style tag input: type a word, Enter/comma commits it as a removable
 * pill; Backspace on an empty draft pops the last one. Replaces the old
 * plain "comma-separated" text field.
 */
export default function TagComposer({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    onChange([...tags, tag]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition focus-within:border-teal/50">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal/35 bg-teal/[.08] px-3 py-1 text-[13px] text-teal"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            aria-label={`حذف برچسب ${tag}`}
            className="text-teal/70 transition hover:text-teal"
          >
            ×
          </button>
        </span>
      ))}

      {tags.length < MAX_TAGS && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            commit(draft);
            setDraft("");
          }}
          placeholder={tags.length === 0 ? "برچسب اضافه کن، مثلاً اکشن…" : "برچسب دیگر…"}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
        />
      )}
    </div>
  );
}
