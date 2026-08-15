export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="num text-xs text-muted border border-border rounded-full px-2.5 py-1">
        —
      </span>
    );
  }

  const tone =
    score >= 8 ? "text-gold border-gold/40 bg-gold/10" :
    score >= 6 ? "text-teal border-teal/40 bg-teal/10" :
    "text-muted border-border bg-surface2";

  return (
    <span className={`num text-sm font-medium rounded-full border px-2.5 py-1 ${tone}`}>
      {score.toFixed(1)}
    </span>
  );
}
