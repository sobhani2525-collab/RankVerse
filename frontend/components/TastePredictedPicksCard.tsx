import TastePredictedPickRow from "./TastePredictedPickRow";
import { PredictedPick } from "@/lib/types";

interface TastePredictedPicksCardProps {
  picks: PredictedPick[];
}

export default function TastePredictedPicksCard({ picks }: TastePredictedPicksCardProps) {
  if (picks.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <h3 className="text-sm font-bold text-ink">پیش‌بینی انتخاب بعدی</h3>
      <div className="mt-4 flex flex-col gap-2">
        {picks.map((pick) => (
          <TastePredictedPickRow key={pick.entity.id} pick={pick} />
        ))}
      </div>
    </div>
  );
}
