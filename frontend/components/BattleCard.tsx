"use client";

import Image from "next/image";
import { BattleEntity } from "@/lib/types";

function posterSrc(poster: string | null): string | null {
  if (!poster) return null;
  if (poster.startsWith("http://") || poster.startsWith("https://")) return poster;
  // Same convention MovieRow.tsx uses for MovieListItem.poster_path
  return `https://image.tmdb.org/t/p/w342${poster}`;
}

export default function BattleCard({
  entity,
  onSelect,
  disabled,
  revealScore,
  scoreDelta,
  outcome,
}: {
  entity: BattleEntity;
  onSelect: () => void;
  disabled?: boolean;
  /** Show the elo score badge (only after the user has just voted). */
  revealScore?: boolean;
  /** Signed change to show next to the score, e.g. +18 / -12. */
  scoreDelta?: number;
  /** "win" = green fade + checkmark, "lose" = red fade. Undefined = no overlay. */
  outcome?: "win" | "lose";
}) {
  const src = posterSrc(entity.poster_url);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface/60 text-right transition hover:border-gold/40 hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <style jsx>{`
        @keyframes battle-check-pop {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          60% {
            transform: scale(1.15);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>

      <div
        className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-500 ease-out ${
          outcome === "win"
            ? "bg-emerald-500/40 opacity-100"
            : outcome === "lose"
            ? "bg-rose-500/35 opacity-100"
            : "opacity-0"
        }`}
      >
        {outcome === "win" && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-14 w-14 text-white drop-shadow-md"
            style={{
              animation: "battle-check-pop 0.4s ease-out",
            }}
          >
            <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.15" />
            <path
              d="M7 12.5l3.2 3.2L17 9"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      <div className="relative aspect-[2/3] w-full bg-surface2">
        {src ? (
          <Image
            src={src}
            alt={entity.title}
            fill
            sizes="(max-width: 768px) 45vw, 320px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            بدون پوستر
          </div>
        )}

        {revealScore && (
          <div
            className={`num absolute left-3 top-3 rounded-full px-2 py-1 text-xs font-medium ${
              (scoreDelta ?? 0) >= 0
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            {(scoreDelta ?? 0) >= 0 ? "+" : ""}
            {scoreDelta ?? 0}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 font-medium text-ink">{entity.title}</h3>
        {revealScore && (
          <span className="num text-xs text-muted">
            امتیاز Elo: {Math.round(entity.elo_score)}
          </span>
        )}
      </div>
    </button>
  );
}
