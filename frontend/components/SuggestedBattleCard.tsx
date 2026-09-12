import Image from "next/image";
import Link from "next/link";
import ScoreBadge from "./ScoreBadge";
import { SuggestedBattle, SuggestedBattleEntity } from "@/lib/types";

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
            alt={entity.title}
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
      <p className="line-clamp-2 text-sm font-medium text-ink">{entity.title}</p>
      <ScoreBadge score={entity.computed_score} />
    </div>
  );
}

export default function SuggestedBattleCard({ battle }: { battle: SuggestedBattle }) {
  const battleHref = `/battles?category=${battle.category}&left_id=${battle.left.id}&right_id=${battle.right.id}`;

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <h3 className="text-sm font-bold text-ink">Battle پیشنهادی</h3>
      <p className="mt-1 text-xs text-muted">
        این یکی رو با یکی از موردعلاقه‌های خودت مقایسه کن
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Side entity={battle.left} />
        <span className="shrink-0 text-xs font-bold text-muted">در برابر</span>
        <Side entity={battle.right} />
      </div>

      <Link
        href={battleHref}
        className="mt-5 block rounded-lg bg-gold px-4 py-2 text-center text-sm font-bold text-bg transition hover:bg-gold/90"
      >
        شروع Battle
      </Link>
    </div>
  );
}
