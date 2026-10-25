/**
 * Spotlight behind a battle's posters plus a faint dot texture, so the pair
 * stands out of the dark instead of floating in it. Decorative; the parent
 * section must be `relative` and its content `relative` too.
 */
export default function BattleSpotlight() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 45% 55% at 50% 55%, rgba(145,99,245,0.16), transparent 70%), radial-gradient(ellipse 30% 30% at 50% 50%, rgba(232,179,74,0.07), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(rgba(242,240,232,0.09) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(ellipse 60% 65% at 50% 55%, black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 65% at 50% 55%, black, transparent 75%)",
        }}
      />
    </>
  );
}
