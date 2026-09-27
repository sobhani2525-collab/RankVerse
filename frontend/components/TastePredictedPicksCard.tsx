import TastePredictedPickRow from "./TastePredictedPickRow";
import { MonoLabel } from "@/components/list-detail/ui";
import { PredictedPick } from "@/lib/types";

export default function TastePredictedPicksCard({ picks }: { picks: PredictedPick[] }) {
  if (picks.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border-soft bg-surface/60 p-6">
      <MonoLabel size="text-[10px]">NEXT PICK</MonoLabel>
      <h3 className="mt-1 text-base font-bold text-ink">پیش‌بینی انتخاب بعدی</h3>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {picks.map((pick) => (
          <TastePredictedPickRow key={pick.entity.id} pick={pick} />
        ))}
      </div>
    </div>
  );
}
