import Link from "next/link";

export default function TasteDnaEmptyState() {
  return (
    <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center">
      <p className="text-sm text-ink">هنوز داریم سلیقه‌ات رو می‌شناسیم</p>
      <p className="mt-2 text-xs text-muted">
        با چند رأی و Battle بیشتر، Taste DNA‌ات شکل می‌گیرد.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/battles"
          className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-sm text-gold transition hover:bg-gold/20"
        >
          نبرد بهترین‌ها
        </Link>
        <Link href="/" className="text-sm text-teal hover:underline">
          رفتن به فهرست فیلم‌ها
        </Link>
      </div>
    </div>
  );
}
