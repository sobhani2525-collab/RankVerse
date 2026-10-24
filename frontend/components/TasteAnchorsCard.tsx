import TasteAnchorRow from "./TasteAnchorRow";
import { MonoLabel } from "@/components/list-detail/ui";
import { TasteAnchor } from "@/lib/types";

export default function TasteAnchorsCard({ anchors }: { anchors: TasteAnchor[] }) {
  if (anchors.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border-soft bg-surface/60 p-6">
      <MonoLabel size="text-[10px]">TASTE ANCHORS</MonoLabel>
      <h3 className="mt-1 text-base font-bold text-ink">فیلم‌هایی که سلیقه‌ات رو ساختن</h3>
      <p className="mt-1.5 text-xs leading-6 text-muted">
        از بین عنوان‌هایی که بالاترین امتیاز رو بهشون دادی، این‌ها بیشترین نقش رو در شکل گرفتن دی‌ان‌ای سلیقه‌ات داشتن.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {anchors.map((anchor) => (
          <TasteAnchorRow key={anchor.entity.id} anchor={anchor} />
        ))}
      </div>
    </div>
  );
}
