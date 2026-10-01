const PHRASES: { text: string; size: number }[] = [
  { text: "بهترین‌های من", size: 36 },
  { text: "برترین‌های نولان", size: 36 },
  { text: "ترسناک‌های شب جمعه", size: 36 },
  { text: "کلاسیک‌های ایرانی", size: 36 },
  { text: "رازآلودترین سریال‌ها", size: 32 },
  { text: "دیدنی‌های آخر هفته", size: 36 },
  { text: "شاهکارهای دهه ۹۰", size: 36 },
  { text: "انیمیشن‌های محبوبم", size: 36 },
];

// Frame rect (stroke centreline); bulbs sit on it every 20 units.
const FX = 40, FY = 20, FW = 360, FH = 140, STEP = 20;

function bulbPositions(): [number, number][] {
  const pts: [number, number][] = [];
  for (let x = FX; x < FX + FW; x += STEP) pts.push([x, FY]);
  for (let y = FY; y < FY + FH; y += STEP) pts.push([FX + FW, y]);
  for (let x = FX + FW; x > FX; x -= STEP) pts.push([x, FY + FH]);
  for (let y = FY + FH; y > FY; y -= STEP) pts.push([FX, y]);
  return pts;
}

const BULBS = bulbPositions();
const STARS: [number, number, number][] = [
  [18, 30, 1.4], [420, 40, 1.2], [30, 120, 1], [412, 130, 1.5], [60, 8, 1], [380, 6, 1.2], [14, 190, 1.2], [426, 200, 1],
];

/** Old-cinema marquee sign: blinking bulbs, rotating list-title phrases and
 *  an "ADMIT ONE" ticket. Purely decorative; animations live in globals.css
 *  (.marquee-*) and stop under prefers-reduced-motion. */
export default function MarqueeSign({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 293"
      className={className}
      role="img"
      aria-label="تابلوی سردر سینما"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="marquee-halo" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#E8B34A" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#E8B34A" stopOpacity="0" />
        </radialGradient>
        <clipPath id="marquee-text-clip">
          <rect x="70" y="68" width="300" height="48" />
        </clipPath>
      </defs>

      <rect x="0" y="0" width="440" height="293" fill="url(#marquee-halo)" />
      {STARS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#F2F0E8" opacity="0.35" />
      ))}

      {/* legs */}
      <rect x="110" y="160" width="10" height="48" fill="#262040" />
      <rect x="320" y="160" width="10" height="48" fill="#262040" />

      {/* frame + cream plate */}
      <rect x={FX} y={FY} width={FW} height={FH} rx="14" fill="#1C1534" stroke="#E8B34A" strokeWidth="3" />
      <rect x="62" y="42" width="316" height="96" rx="8" fill="#F2E6C9" />
      <text x="220" y="62" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace" fontSize="11" letterSpacing="3.5" fill="#8A5A1E">
        NOW SHOWING
      </text>
      <text x="220" y="130" textAnchor="middle" fontFamily="var(--font-vazirmatn), sans-serif" fontSize="12" fontWeight="700" fill="#5A4A3A">
        امشب، روی پرده
      </text>

      <g clipPath="url(#marquee-text-clip)">
        {PHRASES.map((p, i) => (
          <text
            key={p.text}
            className="marquee-phrase"
            style={{ animationDelay: `${i * 4.5}s` }}
            data-first={i === 0 ? "" : undefined}
            x="220"
            y="101"
            textAnchor="middle"
            fontFamily="var(--font-lalezar), var(--font-vazirmatn), sans-serif"
            fontSize={p.size}
            fill="#1A1430"
          >
            {p.text}
          </text>
        ))}
      </g>

      {BULBS.map(([x, y], i) => (
        <circle
          key={i}
          className="marquee-bulb"
          style={i % 2 === 1 ? { animationDelay: "0.6s" } : undefined}
          cx={x}
          cy={y}
          r="4"
          fill="#FFD27A"
        />
      ))}

      {/* ticket */}
      <g transform="rotate(-7 220 250)">
        <rect x="135" y="228" width="170" height="44" rx="5" fill="#E8B34A" />
        <circle cx="135" cy="250" r="7" fill="#0B0F1A" />
        <circle cx="305" cy="250" r="7" fill="#0B0F1A" />
        <line x1="266" y1="234" x2="266" y2="266" stroke="#8A5A1E" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x="198" y="256" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace" fontSize="14" fontWeight="700" letterSpacing="2" fill="#2A1A06">
          ADMIT ONE
        </text>
        <text x="288" y="256" textAnchor="middle" fontFamily="var(--font-jetbrains), monospace" fontSize="12" fontWeight="700" fill="#2A1A06">
          001
        </text>
      </g>
    </svg>
  );
}
