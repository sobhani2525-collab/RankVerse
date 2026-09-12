import { TasteInsight } from "@/lib/types";

interface TasteInsightCardProps {
  insight: TasteInsight;
}

export default function TasteInsightCard({ insight }: TasteInsightCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">تحلیل هوشمند</h3>
        <span className="text-xs text-muted">AI Insight</span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink/90">{insight.insight_text}</p>

      {insight.insight_tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {insight.insight_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-[11px] text-teal"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
