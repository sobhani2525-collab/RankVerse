"use client";
import { useWatchLater } from "@/contexts/WatchLaterContext";

/**
 * "میخواهم تماشا کنم" -- one-click watch-later toggle. On detail pages it is
 * a bookmark ribbon hanging from the poster's top corner.
 */
export default function WatchLaterButton({
  entityId,
  variant = "ribbon",
}: {
  entityId: string;
  variant?: "ribbon" | "pill";
}) {
  const { isWatchLater, toggleWatchLater } = useWatchLater();
  const active = isWatchLater(entityId);
  const label = active ? "از فهرست «میخواهم تماشا کنم» حذف کن" : "میخواهم تماشا کنم";

  if (variant === "ribbon") {
    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        title={label}
        onClick={() => toggleWatchLater(entityId)}
        className="group absolute right-4 top-0 z-10 h-14 w-10 drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)] transition-transform duration-200 hover:translate-y-0.5 focus-visible:outline-none"
      >
        <span
          className={`flex h-full w-full items-start justify-center pt-3 transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-gold ${
            active ? "bg-teal text-bg" : "bg-black/65 text-white backdrop-blur-sm group-hover:bg-black/80"
          }`}
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => toggleWatchLater(entityId)}
      className={`flex h-11 items-center gap-1.5 rounded-xl border px-4 text-sm font-bold transition ${
        active
          ? "border-teal/60 bg-teal/15 text-teal"
          : "border-border bg-surface text-ink hover:border-teal/50 hover:bg-surface-2"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
      </svg>
      {active ? "در فهرست تماشا" : "میخواهم تماشا کنم"}
    </button>
  );
}
