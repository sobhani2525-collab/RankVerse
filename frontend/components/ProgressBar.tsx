interface ProgressBarProps {
  /** 0-100 */
  value: number;
  trackClassName?: string;
  fillClassName?: string;
}

export default function ProgressBar({
  value,
  trackClassName = "bg-surface2",
  fillClassName = "bg-gold",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${trackClassName}`}>
      {/* start-0 (inset-inline-start) rather than left-0: verified with a
          pixel-diffed screenshot that a plain block child with explicit
          width and zero margins already anchors to the right (visually
          correct for RTL) here, because CSS resolves an over-constrained
          block box's margins based on `direction` even when they're 0, not
          'auto' -- but that's a subtle, easy-to-break-by-accident spec
          quirk (e.g. adding any margin to the fill div later would undo
          it). Anchoring via the logical inset property instead makes the
          RTL-correctness explicit and independent of that quirk. */}
      <div
        className={`absolute inset-y-0 start-0 rounded-full ${fillClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
