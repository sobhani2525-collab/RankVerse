interface TasteDnaRingProps {
  /** 0-100 */
  confidencePercent: number;
  size?: number;
  centerLabel?: string;
}

/**
 * A ring, like Constellation.tsx's satellite graph, is a literal
 * data-driven visualization (how much of the ring is filled = model
 * confidence) rather than decoration -- same visual language, SVG stroke
 * instead of scattered nodes.
 */
export default function TasteDnaRing({
  confidencePercent,
  size = 120,
  centerLabel = "اعتماد مدل",
}: TasteDnaRingProps) {
  const clamped = Math.max(0, Math.min(100, confidencePercent));
  const strokeWidth = size * 0.09;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (clamped / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="taste-dna-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8B34A" />
            <stop offset="100%" stopColor="#4FB8A6" />
          </linearGradient>
        </defs>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#232A42"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="url(#taste-dna-ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-2xl font-bold text-ink">{Math.round(clamped)}٪</span>
        <span className="text-[11px] text-muted">{centerLabel}</span>
      </div>
    </div>
  );
}
