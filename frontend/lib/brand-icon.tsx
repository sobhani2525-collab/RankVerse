import { ImageResponse } from "next/og";

const BG = "#0B0F1A";
const GOLD = "#E8B34A";

/**
 * The site's node motif (a gold ring around a dot) on the dark brand
 * background. Shapes only, no text, so no font has to be loaded and it
 * renders identically anywhere. `radius` rounds the tile (0 for apple/maskable
 * icons, which the OS crops itself).
 */
export function brandIcon(size: number, { radius = 0.22, ring = 0.56 }: { radius?: number; ring?: number } = {}) {
  const ringSize = Math.round(size * ring);
  const border = Math.max(2, Math.round(size * 0.075));
  const dot = Math.round(size * 0.2);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
          borderRadius: Math.round(size * radius),
        }}
      >
        <div
          style={{
            width: ringSize,
            height: ringSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            border: `${border}px solid ${GOLD}`,
          }}
        >
          <div style={{ width: dot, height: dot, borderRadius: "50%", background: GOLD }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
