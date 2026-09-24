"use client";

import { useId, useState } from "react";

interface EntityDescriptionProps {
  text?: string | null;
}

// Past this many characters the text starts collapsed to a few lines with a
// "بیشتر" toggle -- TMDb biographies (mostly English) can run to thousands
// of characters and would otherwise push the person's credits far down.
// Length-based (not measured) so server and client render the same thing.
const COLLAPSE_AFTER_CHARS = 420;

export default function EntityDescription({ text }: EntityDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!text) return null;

  const collapsible = text.length > COLLAPSE_AFTER_CHARS;
  const collapsed = collapsible && !expanded;

  return (
    <div className="mt-5">
      {/* dir="auto": a Persian text stays right-to-left, an English one (most
          TMDb biographies) lays out left-to-right with its punctuation intact. */}
      <p
        id={id}
        dir="auto"
        className={`whitespace-pre-line text-sm leading-relaxed text-ink/90 ${collapsed ? "line-clamp-5" : ""}`}
      >
        {text}
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
