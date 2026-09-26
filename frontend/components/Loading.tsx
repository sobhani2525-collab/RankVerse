/**
 * The round loading indicator; `className` sets its size (and anything
 * else). A span, so it can also sit inline inside text (e.g. a <p>).
 */
export function Spinner({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="در حال بارگذاری"
      className={`${className} inline-block shrink-0 animate-spin rounded-full border-2 border-teal/25 border-t-teal`}
    />
  );
}

export default function Loading({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Spinner />
      {label && <p className="text-sm text-muted">{label}</p>}
    </div>
  );
}
