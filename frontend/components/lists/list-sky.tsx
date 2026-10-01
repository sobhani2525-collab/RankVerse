import Image from "next/image";
import type { EntityMini } from "@/lib/types";
import { entityPosterUrl } from "@/lib/list-constellation";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

// Node centres as % from the RIGHT edge / % from the top (RTL: #1 sits on the right).
const SLOTS = [
  { right: 82, top: 44 },
  { right: 50, top: 60 },
  { right: 18, top: 36 },
];
const EDGE_COLORS = ["#A99BFF", "#4FB8A6"];

// Fixed scatter of background stars: [x%, y%, r, delay].
const STARS: [number, number, number, number][] = [
  [8, 20, 1, 0], [22, 78, 1.4, 1.2], [37, 14, 1, 2.4], [63, 86, 1, 0.6],
  [71, 18, 1.4, 3], [92, 70, 1, 1.8], [46, 92, 1, 2.8], [96, 16, 1, 0.9],
];

/**
 * The list as a tiny constellation: up to three poster nodes joined by
 * violet/teal edges (the same colors the list page uses for shared
 * people/genres), rank badges in the spine style (#1 gold).
 */
export default function ListSky({
  items,
  heightClass = "h-44",
  tileClass = "w-[68px]",
}: {
  items: EntityMini[];
  heightClass?: string;
  tileClass?: string;
}) {
  const nodes = items.slice(0, SLOTS.length).map((entity, i) => ({ entity, ...SLOTS[i] }));
  const points = nodes.map((n) => `${100 - n.right},${n.top}`);

  return (
    <div
      className={`relative w-full overflow-hidden ${heightClass}`}
      style={{
        background:
          "radial-gradient(ellipse 70% 80% at 50% 0%, rgba(145,99,245,0.16), transparent), radial-gradient(ellipse 60% 70% at 100% 100%, rgba(79,184,166,0.10), transparent)",
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {STARS.map(([x, y, r, d], i) => (
          <circle key={i} cx={x} cy={y} r={r * 0.5} fill="#F2F0E8" className="rv-twinkle" style={{ ["--rv-delay" as string]: `${d}s` }} />
        ))}
        {nodes.length > 1 &&
          nodes.slice(1).map((n, i) => {
            const [x1, y1] = points[i].split(",");
            const [x2, y2] = points[i + 1].split(",");
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={EDGE_COLORS[i % 2]}
                strokeOpacity="0.7"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
      </svg>

      {nodes.length === 0 && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-dim">هنوز ستاره‌ای ندارد</span>
      )}

      {nodes.map(({ entity, right, top }, i) => {
        const poster = entityPosterUrl(entity, "w342");
        const first = i === 0;
        return (
          <div
            key={entity.id}
            className={`absolute aspect-[2/3] -translate-y-1/2 translate-x-1/2 transition-transform duration-300 group-hover:scale-105 ${tileClass}`}
            style={{ right: `${right}%`, top: `${top}%`, zIndex: SLOTS.length - i }}
          >
            <div
              className={`relative h-full w-full overflow-hidden rounded-lg border bg-surface-2 shadow-[0_6px_18px_rgba(0,0,0,0.5)] ${
                first ? "border-gold/70 shadow-[0_0_0_4px_rgba(232,179,74,0.12)]" : "border-border"
              }`}
            >
              {poster ? (
                <Image src={poster} alt={displayTitle(entity)} fill sizes="120px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-muted">
                  {displayTitle(entity)}
                </span>
              )}
            </div>
            <span
              className={`num absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] bg-bg text-[11px] font-extrabold ${
                first ? "border-gold text-gold" : "border-ink-dim text-ink-dim"
              }`}
            >
              {toFaDigits(i + 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
