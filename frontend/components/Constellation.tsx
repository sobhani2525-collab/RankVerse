interface ConstellationProps {
  director?: string | null;
  genre?: string | null;
  year?: number | null;
  size?: number;
}

/**
 * Renders the movie as a bright central node with up to three satellite
 * nodes (director / genre / year), connected by thin edges. This is a
 * literal, data-driven visualization of the knowledge-graph relationships
 * behind the score — not a decorative flourish.
 */
export default function Constellation({ director, genre, year, size = 88 }: ConstellationProps) {
  const satellites = [
    { label: director, angle: -100, color: "#E8B34A" },
    { label: genre, angle: 20, color: "#4FB8A6" },
    { label: year ? String(year) : null, angle: 140, color: "#8A93A6" },
  ].filter((s) => s.label);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.32;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {satellites.map((s, i) => {
        const rad = (s.angle * Math.PI) / 180;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} className="edge-line" />
            <circle cx={x} cy={y} r={2.5} fill={s.color} opacity={0.85} />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={5} fill="#E8B34A" />
      <circle cx={cx} cy={cy} r={9} fill="#E8B34A" opacity={0.18} />
    </svg>
  );
}
