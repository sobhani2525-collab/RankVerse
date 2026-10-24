import { RatingStyle, TasteInsight } from "@/lib/types";
import { toFaDecimal } from "@/lib/format-number";

// Average-rating gap from the platform's (in stars) that reads as a style.
const STYLE_GAP = 0.3;

function ratingStyleName(style: RatingStyle): { name: string; tone: string } | null {
  if (style.platform_avg == null) return null;
  const gap = style.user_avg - style.platform_avg;
  if (gap <= -STYLE_GAP) return { name: "سخت‌گیر", tone: "text-[#C76B7E]" };
  if (gap >= STYLE_GAP) return { name: "دست‌ودل‌باز", tone: "text-gold" };
  return { name: "متعادل", tone: "text-teal" };
}

/** Where an average sits on the 1-5 scale, as a 0-100 position. */
const pos = (avg: number) => `${((Math.max(1, Math.min(5, avg)) - 1) / 4) * 100}%`;

interface TasteReadingProps {
  insight: TasteInsight | null;
  ratingStyle?: RatingStyle | null;
  /** "other" on public profiles: third-person captions. */
  perspective?: "self" | "other";
}

/**
 * The profile's written reading -- rule-based sentences built from the
 * numbers (taste/compute.py's build_insight), not an AI model -- plus the
 * user's rating style against the platform's average. Rendered inside
 * TasteDnaCard, under the archetype, so a short reading never leaves a
 * half-empty card of its own.
 */
export default function TasteReading({ insight, ratingStyle, perspective = "self" }: TasteReadingProps) {
  const style = ratingStyle ? ratingStyleName(ratingStyle) : null;
  if (!insight && !style) return null;

  return (
    <div className="flex flex-col gap-4">
      {insight && (
        <div className="relative rounded-xl border border-border-soft bg-bg/40 px-4 py-3.5">
          <span className="absolute -top-2.5 right-3 bg-surface px-1.5 text-[10px] text-dim">خوانش سلیقه</span>
          <p className="text-sm leading-7 text-ink/90">{insight.insight_text}</p>
        </div>
      )}

      {ratingStyle && style && ratingStyle.platform_avg != null && (
        <div className="rounded-xl border border-border-soft bg-bg/40 px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">سبک امتیازدهی</span>
            <span className={`text-sm font-bold ${style.tone}`}>{style.name}</span>
          </div>
          <div className="relative mt-4 h-1.5 rounded-full bg-surface2" dir="ltr">
            <span
              className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-muted"
              style={{ left: pos(ratingStyle.platform_avg) }}
              title="میانگین سایت"
            />
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-gold"
              style={{ left: pos(ratingStyle.user_avg) }}
            />
          </div>
          <p className="mt-2.5 text-[11px] leading-6 text-muted">
            {perspective === "self" ? "میانگین امتیازهای تو" : "میانگین امتیازهایش"}{" "}
            <span className="num text-gold">{toFaDecimal(ratingStyle.user_avg)}</span> از ۵؛ میانگین کاربران{" "}
            <span className="num text-ink">{toFaDecimal(ratingStyle.platform_avg)}</span>.
          </p>
        </div>
      )}
    </div>
  );
}
