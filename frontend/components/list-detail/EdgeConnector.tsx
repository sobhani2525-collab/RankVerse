import type { ListEdge } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";
import { EDGE_STYLES, entityHref } from "@/lib/list-constellation";
import { Chip, MonoLabel } from "./ui";

/**
 * The gap between two spine items: a ring node sitting on the spine line
 * (colored by the edge kind) with why the two items are connected.
 */
export default function EdgeConnector({ edge, className = "" }: { edge: ListEdge; className?: string }) {
  const style = EDGE_STYLES[edge.kind];

  return (
    <div className={`flex gap-3 lg:gap-6 ${className}`}>
      <div className="flex w-9 shrink-0 flex-col items-center lg:w-[52px]" aria-hidden="true">
        <div className={`w-0 flex-1 border-r-2 ${style.line}`} />
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-bg lg:h-[22px] lg:w-[22px] ${style.ring}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full lg:h-[7px] lg:w-[7px] ${style.dot}`} />
        </span>
        <div className={`w-0 flex-1 border-r-2 ${style.line}`} />
      </div>

      <div className="flex min-h-[72px] min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 py-3 lg:min-h-[80px] lg:gap-x-3">
        {edge.kind === "none" ? (
          <>
            <MonoLabel size="text-[10px]" className="hidden text-dim/70 lg:inline">
              GAP
            </MonoLabel>
            <span className="text-[13px] text-dim lg:text-sm">اتصال مستقیمی ندارند</span>
          </>
        ) : (
          <>
            <MonoLabel size="text-[10px]" className="hidden text-dim lg:inline">
              RELATIONSHIP
            </MonoLabel>
            <span className="text-[13px] text-muted lg:text-sm">{edge.label_fa}</span>
            {edge.targets.map((target) => (
              <Chip
                key={target.id}
                href={entityHref(target.entity_type, target.slug)}
                tone={style.chip}
                ltr={edge.kind === "people"}
              >
                {edge.kind === "genre" ? genreLabel(target.title) : target.title}
              </Chip>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
