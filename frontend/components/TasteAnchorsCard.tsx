import TasteAnchorRow from "./TasteAnchorRow";
import { TasteAnchor } from "@/lib/types";

interface TasteAnchorsCardProps {
  anchors: TasteAnchor[];
}

export default function TasteAnchorsCard({ anchors }: TasteAnchorsCardProps) {
  if (anchors.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <h3 className="text-sm font-bold text-ink">چیزهایی که سلیقه‌ات رو ساختن</h3>
      <div className="mt-4 flex flex-col gap-2">
        {anchors.map((anchor) => (
          <TasteAnchorRow key={anchor.entity.id} anchor={anchor} />
        ))}
      </div>
    </div>
  );
}
