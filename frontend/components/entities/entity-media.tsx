import Image from "next/image";

export type MediaKind = "image" | "audio" | "none";

interface EntityMediaProps {
  src?: string | null;
  alt: string;
  mediaKind?: MediaKind;
  className?: string;
  sizes?: string;
}

/**
 * Renders the real poster/cover when `src` is present; otherwise a brand
 * gradient placeholder with an icon that matches what's missing (a film
 * icon for a poster-less movie/show, a note for audio) — shared by
 * EntityCard and ListCard so both media slots stay visually identical.
 */
export default function EntityMedia({ src, alt, mediaKind = "image", className = "", sizes }: EntityMediaProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes ?? "(max-width: 768px) 45vw, 20vw"}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-brand ${className}`}>
      {mediaKind === "image" && (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <line x1="2" y1="8" x2="22" y2="8" />
          <line x1="7" y1="4" x2="7" y2="8" />
          <line x1="12" y1="4" x2="12" y2="8" />
          <line x1="17" y1="4" x2="17" y2="8" />
        </svg>
      )}
      {mediaKind === "audio" && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" aria-hidden="true">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      )}
    </div>
  );
}
