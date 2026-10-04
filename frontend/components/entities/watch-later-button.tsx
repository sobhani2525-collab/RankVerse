"use client";
import { useWatchLater } from "@/contexts/WatchLaterContext";

/** "تماشا خواهم کرد" -- one-click watch-later toggle next to AddToListMenu. */
export default function WatchLaterButton({ entityId }: { entityId: string }) {
  const { isWatchLater, toggleWatchLater } = useWatchLater();
  const active = isWatchLater(entityId);

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
      {active ? "در فهرست تماشا" : "تماشا خواهم کرد"}
    </button>
  );
}
