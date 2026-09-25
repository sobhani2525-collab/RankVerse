"use client";
import { toFaDigits } from "@/lib/format-number";
import { EDGE_STYLES } from "@/lib/list-constellation";
import ListNodeItem from "./ListNodeItem";
import EdgeConnector from "./EdgeConnector";
import { useListViewer } from "./ListViewerContext";

function RankNode({ rank, ranked, className = "" }: { rank: number; ranked: boolean; className?: string }) {
  const first = rank === 1;
  const tone = first
    ? "border-gold text-gold shadow-[0_0_0_5px_rgba(232,179,74,0.14)] lg:shadow-[0_0_0_6px_rgba(232,179,74,0.14)]"
    : "border-ink-dim text-ink-dim";
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-bg text-[15px] font-extrabold lg:h-12 lg:w-12 lg:text-lg ${tone} ${className}`}
    >
      {ranked ? (
        <span className="num">{toFaDigits(rank)}</span>
      ) : (
        <span className={`h-2 w-2 rounded-full ${first ? "bg-gold" : "bg-ink-dim"}`} aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * The list as a vertical path on the RIGHT (RTL): a rank node per item, a
 * spine line colored by the item's outgoing edge (people = violet, genre =
 * teal, none = gray dashed), and an EdgeConnector between consecutive
 * items saying why they're connected. `addSlot` (the add-item node) hangs
 * off the end of the spine.
 *
 * Renders from ListViewerContext so an item added from the form joins
 * immediately and animates in: its rank node pops, the spine line under it
 * grows, the card rises, and the edge from the previous item fades in.
 */
export default function ConstellationSpine({ addSlot }: { addSlot?: React.ReactNode }) {
  const { detail, justAddedEntityId } = useListViewer();
  const { items } = detail;
  const edges = detail.edges ?? [];
  const backlinks = new Map((detail.backlinks ?? []).map((b) => [b.rank, b]));
  const ranked = detail.is_ranked || detail.list_type === "community_ordered";

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
          این لیست هنوز آیتمی ندارد.
        </div>
        {addSlot}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <ol className="flex flex-col">
        {items.map((item, index) => {
          const rank = index + 1;
          const edge = edges[index];
          const isLast = index === items.length - 1;
          const isNew = item.entity.id === justAddedEntityId;
          const beforeNew = !!justAddedEntityId && items[index + 1]?.entity.id === justAddedEntityId;
          // The last item's line runs on down to the add node.
          const line = edge ? EDGE_STYLES[edge.kind].line : isLast && addSlot ? "border-dashed border-[#2C4A48]" : null;
          return (
            // Keyed by entity (unique per list) so the optimistic item keeps
            // its DOM node -- and doesn't replay its entrance -- when the
            // saved item's real id replaces the temporary one.
            <li key={item.entity.id} id={`rank-${rank}`} className="flex scroll-mt-24 flex-col">
              <div className="flex gap-3 lg:gap-6">
                <div className="flex w-9 shrink-0 flex-col items-center lg:w-[52px]">
                  <RankNode rank={rank} ranked={ranked} className={isNew ? "rv-node-in" : ""} />
                  {line && (
                    <div
                      className={`mt-1.5 w-0 flex-1 border-r-2 lg:mt-2 ${line} ${isNew ? "rv-line-in" : ""}`}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <ListNodeItem
                    item={item}
                    backlink={backlinks.get(rank)}
                    canBattle={items.length >= 2}
                    pending={item.id.startsWith("temp-")}
                    className={isNew ? "rv-card-in" : ""}
                  />
                </div>
              </div>
              {!isLast && edge && <EdgeConnector edge={edge} className={beforeNew ? "rv-fade-in" : ""} />}
              {!isLast && !edge && <div className="h-6" />}
              {isLast && addSlot && (
                <div className="flex gap-3 lg:gap-6" aria-hidden="true">
                  <div className="flex h-6 w-9 shrink-0 justify-center lg:h-8 lg:w-[52px]">
                    <div className="w-0 border-r-2 border-dashed border-[#2C4A48]" />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {addSlot}
    </div>
  );
}
