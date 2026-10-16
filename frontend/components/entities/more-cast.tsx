"use client";

import { useState } from "react";
import Image from "next/image";
import { CastMember } from "@/lib/types";
import { toFaDigits } from "@/lib/format-number";

const INITIAL = 12;

// next/image only allows TMDb hosts.
function isTmdb(url: string | null): url is string {
  return !!url && url.startsWith("https://image.tmdb.org/");
}

/** Billed cast beyond the linked top five: name, role and photo (no person page for these). */
export default function MoreCast({ cast }: { cast: CastMember[] }) {
  const [all, setAll] = useState(false);
  if (cast.length === 0) return null;
  const shown = all ? cast : cast.slice(0, INITIAL);

  return (
    <section aria-label="بازیگران بیشتر" className="mt-16">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-ink">بازیگران بیشتر</h2>
        <span className="num text-xs text-muted">{toFaDigits(cast.length)} نفر</span>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((c, i) => (
          <li key={`${c.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 p-2.5">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface2 text-sm text-muted">
              {isTmdb(c.image_url) ? <Image src={c.image_url} alt="" fill sizes="48px" className="object-cover" /> : c.name.charAt(0)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{c.name}</span>
              {c.character && <span className="block truncate text-xs text-muted">{c.character}</span>}
            </span>
          </li>
        ))}
      </ul>
      {cast.length > INITIAL && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mt-4 rounded-full border border-border px-4 py-1.5 text-xs text-muted transition hover:border-gold/40 hover:text-gold"
        >
          {all ? "نمایش کمتر" : `نمایش همه (${toFaDigits(cast.length)})`}
        </button>
      )}
    </section>
  );
}
