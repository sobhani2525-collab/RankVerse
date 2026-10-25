import Image from "next/image";
import WatchLaterButton from "@/components/entities/watch-later-button";

/**
 * "Ambient glow" behind a movie / series hero: the poster itself, blown up
 * and blurred far past recognition, so its dominant colours wash softly over
 * the top of the page (the way a screen lights a dark cinema). Faded out
 * toward the far side and the bottom so it never competes with the text.
 * Rendered in a full-width `relative isolate` wrapper around the page's
 * <main> (not inside the max-w-7xl <main>), so it reaches both edges of the
 * window; decorative only.
 */
export function AmbientGlow({ posterPath }: { posterPath: string | null }) {
  if (!posterPath) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] overflow-hidden sm:h-[900px]"
      style={{
        // Strongest behind the poster (the right edge, RTL), gone by the bottom.
        maskImage: "radial-gradient(ellipse 110% 85% at 80% 30%, #000 40%, transparent 85%)",
        WebkitMaskImage: "radial-gradient(ellipse 110% 85% at 80% 30%, #000 40%, transparent 85%)",
      }}
    >
      <Image
        src={`https://image.tmdb.org/t/p/w185${posterPath}`}
        alt=""
        fill
        sizes="185px"
        className="scale-125 object-cover opacity-60 blur-[70px] brightness-125 saturate-[1.8]"
      />
      {/* A light scrim over the text side (left, RTL), clear by the poster, so the title and
          controls read calmly while the poster's own colours stay strong beside it. */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg/50 via-bg/20 to-transparent" />
    </div>
  );
}

/** The hero's own poster: rounder corners, a soft rim, and a deep shadow so it floats off the glow. */
export function DetailPoster({ entityId, posterPath, alt }: { entityId: string; posterPath: string | null; alt: string }) {
  return (
    <div className="relative mx-auto h-[330px] w-[220px] shrink-0 sm:mx-0 sm:h-[480px] sm:w-80">
      <WatchLaterButton entityId={entityId} variant="ribbon" />
      <div className="h-full w-full overflow-hidden rounded-2xl bg-surface2 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.85),0_10px_24px_-8px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
        {posterPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w500${posterPath}`}
            alt={alt}
            width={320}
            height={480}
            priority
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">بدون پوستر</div>
        )}
      </div>
    </div>
  );
}
