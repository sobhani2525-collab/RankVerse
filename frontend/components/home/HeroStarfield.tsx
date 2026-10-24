// Decorative backdrop for the home hero: a slow-drifting field of faint
// stars and one breathing nebula. CSS-only (see .rv-starfield / .rv-nebula
// in globals.css), switched off under prefers-reduced-motion.

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// Deterministic so server and client markup agree.
const STARS = Array.from({ length: 46 }, (_, i) => ({
  left: round2(rand(i + 1) * 100),
  top: round2(rand(i + 101) * 100),
  size: rand(i + 201) > 0.85 ? 2 : 1,
  delay: round2(rand(i + 301) * 8),
  dur: round2(5 + rand(i + 401) * 6),
}));

export default function HeroStarfield() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="rv-nebula absolute -left-[10%] top-[10%] h-[70%] w-[60%] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(145,99,245,0.14), transparent)" }}
      />
      <div
        className="rv-nebula absolute right-[-5%] top-[-10%] h-[55%] w-[45%] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(79,184,166,0.08), transparent)", animationDelay: "-14s" }}
      />
      <div className="rv-starfield absolute inset-x-0 -top-[20%] h-[140%]">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="rv-twinkle absolute rounded-full bg-ink"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              ["--rv-delay" as string]: `${s.delay}s`,
              ["--rv-dur" as string]: `${s.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
