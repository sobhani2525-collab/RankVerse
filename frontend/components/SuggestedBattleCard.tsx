import Image from "next/image";
import Link from "next/link";
import { SectionHeading } from "@/components/list-detail/ui";
import { entityHref } from "@/lib/list-constellation";
import { SuggestedBattle, SuggestedBattleEntity } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

export interface BattleReason {
  text: string;
  tone: "people" | "genre";
}

function PosterBox({ entity, highlight }: { entity: SuggestedBattleEntity; highlight: boolean }) {
  const posterUrl = entity.poster_path ? `https://image.tmdb.org/t/p/w342${entity.poster_path}` : null;
  const href = entityHref(entity.entity_type, entity.slug);

  const box = (
    <div
      className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 transition ${
        highlight
          ? "border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.18)] hover:shadow-[0_0_0_4px_rgba(232,179,74,0.32)]"
          : "border border-border hover:border-violet-light"
      }`}
    >
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={displayTitle(entity)}
          fill
          sizes="(max-width: 768px) 45vw, 260px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted">بدون پوستر</div>
      )}
    </div>
  );

  return href ? <Link href={href}>{box}</Link> : box;
}

function TitleBlock({ entity }: { entity: SuggestedBattleEntity }) {
  const href = entityHref(entity.entity_type, entity.slug);
  const title = displayTitle(entity);
  return (
    <div className="flex flex-col items-start gap-1 text-start">
      {href ? (
        <Link href={href} className="text-[15px] font-extrabold leading-snug text-ink transition hover:text-gold">
          {title}
        </Link>
      ) : (
        <span className="text-[15px] font-extrabold leading-snug text-ink">{title}</span>
      )}
      {entity.computed_score != null && (
        <span className="num text-xs text-dim">{toFaDigits(entity.computed_score.toFixed(1))}</span>
      )}
    </div>
  );
}

/**
 * Restyled to match the list detail page's ListBattlePreview visual language
 * (violet "BATTLE" kicker, VS badge, gold-ringed poster for "this" entity) --
 * but the underlying data/behavior is unchanged from before: still a single
 * server-picked pair (see useSuggestedBattle/BattleSection) with one
 * "شروع نبرد" link into the standalone battle flow, not the list page's
 * multi-opponent "winner stays" run.
 */
export default function SuggestedBattleCard({
  battle,
  reason,
}: {
  battle: SuggestedBattle;
  reason?: BattleReason | null;
}) {
  const battleHref = `/battles?category=${battle.category}&left_id=${battle.left.id}&right_id=${battle.right.id}`;
  const toneClass = reason?.tone === "genre" ? "text-teal" : "text-violet-light";
  const dotClass = reason?.tone === "genre" ? "bg-teal" : "bg-violet-light";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
      <div className="flex flex-col items-start gap-3 lg:w-[300px] lg:shrink-0">
        <SectionHeading en="BATTLE" fa="کدام بهتر است؟" tone="text-violet-light" />
        <p className="text-xs text-dim">این یکی رو با یکی از فیلم‌های نزدیک در گراف مقایسه کن</p>

        {reason && (
          <div className={`flex items-center gap-2 text-xs ${toneClass}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
            {reason.text}
          </div>
        )}

        <Link href={battleHref} className="btn-primary mt-1 w-full justify-center text-sm hover:opacity-90 lg:w-auto">
          شروع نبرد
        </Link>
      </div>

      <div className="lg:max-w-[560px] lg:flex-1">
        <div className="relative grid grid-cols-2 gap-2.5">
          <PosterBox entity={battle.left} highlight={false} />
          <PosterBox entity={battle.right} highlight />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-bg font-mono text-xs text-violet-light shadow-[0_0_0_6px_rgba(11,15,26,0.9)]"
            aria-hidden="true"
          >
            VS
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <TitleBlock entity={battle.left} />
          <TitleBlock entity={battle.right} />
        </div>
      </div>
    </div>
  );
}
