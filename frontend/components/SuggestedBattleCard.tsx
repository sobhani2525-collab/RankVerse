import Image from "next/image";
import Link from "next/link";
import ScoreBadge from "./ScoreBadge";
import { SuggestedBattle, SuggestedBattleEntity } from "@/lib/types";
import { displayTitle } from "@/lib/title";

function Side({ entity }: { entity: SuggestedBattleEntity }) {
  const posterUrl = entity.poster_path
    ? `https://image.tmdb.org/t/p/w200${entity.poster_path}`
    : null;

  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <div className="h-28 w-20 overflow-hidden rounded-lg bg-surface2">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={displayTitle(entity)}
            width={80}
            height={112}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">
            بدون پوستر
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium text-ink">{displayTitle(entity)}</p>
      <ScoreBadge score={entity.computed_score} />
    </div>
  );
}

export default function SuggestedBattleCard({ battle }: { battle: SuggestedBattle }) {
  const battleHref = `/battles?category=${battle.category}&left_id=${battle.left.id}&right_id=${battle.right.id}`;

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <h3 className="text-sm font-bold text-ink">نبرد پیشنهادی</h3>
      <p className="mt-1 text-xs text-muted">
        این یکی رو با یکی از موردعلاقه‌های خودت مقایسه کن
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Side entity={battle.left} />
        <span className="shrink-0 text-xs font-bold text-muted">در برابر</span>
        <Side entity={battle.right} />
      </div>

      <Link href={battleHref} className="btn-primary mt-5 w-full justify-center text-sm hover:opacity-90">
        شروع نبرد
      </Link>
    </div>
  );
}
