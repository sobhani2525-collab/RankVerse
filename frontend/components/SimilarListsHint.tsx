"use client";
import { useEffect, useState } from "react";
import { getSimilarLists, type SimilarList } from "@/lib/api";
import { listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * Under the new-list title: while the user types, shows existing public lists
 * with a similar title so they can join one instead of creating a duplicate.
 * Advisory only -- it never blocks creating the list.
 */
export default function SimilarListsHint({ title }: { title: string }) {
  const query = useDebouncedValue(title.trim(), 500);
  const [matches, setMatches] = useState<SimilarList[]>([]);

  useEffect(() => {
    if (query.length < 3) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    getSimilarLists(query, controller.signal)
      .then(setMatches)
      .catch(() => {
        if (!controller.signal.aborted) setMatches([]);
      });
    return () => controller.abort();
  }, [query]);

  // Stale results for an older title shouldn't linger while the user keeps typing.
  if (matches.length === 0 || title.trim().length < 3) return null;

  const exact = matches.some((m) => m.exact);

  return (
    <div
      role="status"
      className={`flex flex-col gap-2.5 rounded-xl border px-4 py-3 ${
        exact ? "border-gold/50 bg-gold/[.07]" : "border-teal/30 bg-teal/[.06]"
      }`}
    >
      <p className={`text-sm font-bold ${exact ? "text-gold" : "text-teal"}`}>
        {exact ? "لیستی با همین عنوان از قبل وجود دارد" : "فهرست‌های مشابه"}
      </p>
      <p className="text-xs leading-[1.8] text-muted">
        قبل از ساخت لیست جدید نگاهی بیندازید؛ شاید بتوانید آیتم‌هایتان را به یکی از این‌ها اضافه کنید.
      </p>
      <ul className="flex flex-col gap-1.5">
        {matches.map((m) => (
          <li key={m.slug}>
            <a
              href={listHref(m.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-border-soft bg-surface px-3 py-2 transition hover:border-teal/40"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{m.title}</span>
              {/* Separate spans: a mixed "@user · n آیتم" string gets scrambled by bidi ordering. */}
              <span className="flex shrink-0 items-center gap-2 text-xs text-dim">
                <span dir="rtl">{toFaDigits(m.item_count)} آیتم</span>
                {m.owner_username && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span dir="ltr">@{m.owner_username}</span>
                  </>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
