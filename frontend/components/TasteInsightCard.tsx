import { MonoLabel } from "@/components/list-detail/ui";
import { TasteInsight } from "@/lib/types";

interface TasteInsightCardProps {
  insight: TasteInsight;
}

export default function TasteInsightCard({ insight }: TasteInsightCardProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border-soft bg-surface/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-ink">تحلیل هوشمند</h3>
        <MonoLabel size="text-[10px]">AI INSIGHT</MonoLabel>
      </div>

      <p className="mt-4 flex-1 text-[15px] leading-[1.9] text-ink/90">{insight.insight_text}</p>

      {insight.insight_tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {insight.insight_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-[11px] text-teal"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
