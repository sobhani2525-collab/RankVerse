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
    <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackClassName}`}>
      <div
        className={`h-full rounded-full ${fillClassName}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
