"use client";

import { useId, useState, type ReactNode } from "react";

interface EntityDescriptionProps {
  text?: string | null;
  /** Font size + line height of the text; the person page reads a step larger. */
  textClassName?: string;
}

// Past this many characters the text starts collapsed to a few lines with a
// "بیشتر" toggle -- TMDb biographies (mostly English) can run to thousands
// of characters and would otherwise push the person's credits far down.
// Length-based (not measured) so server and client render the same thing.
const COLLAPSE_AFTER_CHARS = 420;

// A run of Latin text (a title, a name, an IPA pronunciation). Inside a Persian
// paragraph each run is isolated with <bdi> so its neighbouring punctuation,
// parentheses and digits no longer jump around the right-to-left line.
const LATIN_RUN = /[A-Za-zÀ-˿](?:[A-Za-z0-9À-˿'’.:\-/ &!]*[A-Za-z0-9À-˿!])?/g;

function isMostlyPersian(text: string): boolean {
  const persian = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return persian > latin;
}

function isolateLatin(text: string) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(<bdi key={i}>{m[0]}</bdi>);
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function EntityDescription({ text, textClassName = "text-sm leading-relaxed" }: EntityDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!text) return null;
  const rtl = isMostlyPersian(text);

  const collapsible = text.length > COLLAPSE_AFTER_CHARS;
  const collapsed = collapsible && !expanded;

  return (
    <div className="mt-5">
      {/* Direction follows the dominant script (not the first character, which
          broke Persian bios that open with a Latin name); Latin runs inside a
          Persian text are isolated. */}
      <p
        id={id}
        dir={rtl ? "rtl" : "ltr"}
        className={`whitespace-pre-line ${textClassName} text-ink/90 ${collapsed ? "line-clamp-5" : ""}`}
      >
        {rtl ? isolateLatin(text) : text}
      </p>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-2 text-xs text-gold hover:underline"
        >
          {expanded ? "کمتر" : "بیشتر"}
        </button>
      )}
    </div>
  );
}
