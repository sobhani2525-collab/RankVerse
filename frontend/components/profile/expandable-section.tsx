"use client";

import { Children, ReactNode, useState } from "react";
import { SectionHeading } from "@/components/list-detail/ui";
import { toFaDigits } from "@/lib/format-number";

/**
 * A profile section that shows its first `preview` items and a "نمایش همه
 * (N)" toggle in the heading, so a long profile stays light. Items come in
 * as children (already-rendered cards), which also lets a server page use
 * it. With no items, `fallback` (loading / error / empty state) renders
 * instead of the grid.
 */
export default function ExpandableSection({
  id,
  en,
  fa,
  aside,
  preview,
  gridClassName,
  fallback,
  total,
  children,
}: {
  id?: string;
  en: string;
  fa: string;
  /** Extra heading action shown next to the toggle (e.g. "+ فهرست جدید"). */
  aside?: ReactNode;
  preview: number;
  gridClassName: string;
  fallback?: ReactNode;
  /** Count for the toggle when it differs from the items passed in. */
  total?: number;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const count = total ?? items.length;
  const collapsible = items.length > preview;

  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <SectionHeading
        en={en}
        fa={fa}
        aside={
          collapsible || aside ? (
            <div className="flex items-center gap-4">
              {aside}
              {collapsible && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="text-xs font-semibold text-gold hover:underline"
                >
                  {expanded ? "نمایش کمتر" : `نمایش همه (${toFaDigits(count)})`}
                </button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="mt-5">
        {items.length === 0 ? fallback : <div className={gridClassName}>{expanded ? items : items.slice(0, preview)}</div>}
      </div>
    </section>
  );
}
