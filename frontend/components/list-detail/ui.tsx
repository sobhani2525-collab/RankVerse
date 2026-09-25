import Link from "next/link";

/**
 * Small presentational pieces shared by the list detail page's sections.
 * No hooks -- usable from both server and client components.
 */

/** Uppercase mono English label (JetBrains Mono, wide tracking). */
export function MonoLabel({
  children,
  className = "text-dim",
  size = "text-[11px]",
}: {
  children: React.ReactNode;
  className?: string;
  size?: string;
}) {
  return (
    <span dir="ltr" className={`font-mono ${size} uppercase tracking-[0.3em] ${className}`}>
      {children}
    </span>
  );
}

/** Section header: mono English kicker over a bold Persian title. */
export function SectionHeading({
  en,
  fa,
  tone = "text-dim",
  aside,
}: {
  en: string;
  fa: string;
  tone?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col items-start gap-1 text-start">
        <MonoLabel className={tone}>{en}</MonoLabel>
        <h2 className="text-lg font-extrabold text-ink lg:text-[22px]">{fa}</h2>
      </div>
      {aside}
    </div>
  );
}

/** Row label used on item cards: colored dot + mono EN + Persian. */
export function RowLabel({ dot, en, fa }: { dot: string; en: string; fa?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <MonoLabel size="text-[10px]">{en}</MonoLabel>
      {fa && <span className="text-xs text-muted">{fa}</span>}
    </div>
  );
}

/** Rounded outline chip; a link when href is given. */
export function Chip({
  href,
  tone,
  children,
  ltr = false,
  className = "",
}: {
  href?: string | null;
  tone: string;
  children: React.ReactNode;
  ltr?: boolean;
  className?: string;
}) {
  const cls = `inline-flex min-h-[32px] items-center rounded-full border px-3 py-1 text-[13px] leading-tight transition ${tone} ${className}`;
  return href ? (
    <Link href={href} dir={ltr ? "ltr" : undefined} className={cls}>
      {children}
    </Link>
  ) : (
    <span dir={ltr ? "ltr" : undefined} className={cls}>
      {children}
    </span>
  );
}

/** Gold ring-and-dot glyph (hero kicker). */
export function RingDot({ className = "border-gold", dot = "bg-gold", size = "h-[22px] w-[22px]" }: {
  className?: string;
  dot?: string;
  size?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] ${size} ${className}`}
      aria-hidden="true"
    >
      <span className={`h-[7px] w-[7px] rounded-full ${dot}`} />
    </span>
  );
}
