import type { ListDetail } from "@/lib/types";
import { toFaDigits } from "@/lib/format-number";
import { battleHrefFor, EDGE_STYLES } from "@/lib/list-constellation";
import ListNodeItem from "./ListNodeItem";
import EdgeConnector from "./EdgeConnector";

function RankNode({ rank, ranked }: { rank: number; ranked: boolean }) {
  const first = rank === 1;
  const tone = first
    ? "border-gold text-gold shadow-[0_0_0_5px_rgba(232,179,74,0.14)] lg:shadow-[0_0_0_6px_rgba(232,179,74,0.14)]"
    : "border-ink-dim text-ink-dim";
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-bg text-[15px] font-extrabold lg:h-12 lg:w-12 lg:text-lg ${tone}`}
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
 * items saying why they're connected.
 */
export default function ConstellationSpine({ detail }: { detail: ListDetail }) {
  const { items } = detail;
  const edges = detail.edges ?? [];
  const backlinks = new Map((detail.backlinks ?? []).map((b) => [b.rank, b]));
  const ranked = detail.is_ranked || detail.list_type === "community_ordered";
  const communityVoting = detail.list_type === "community_ordered";

  return (
    <ol className="flex flex-col">
      {items.map((item, index) => {
        const rank = index + 1;
        const edge = edges[index];
        const isLast = index === items.length - 1;
        return (
          <li key={item.id} id={`rank-${rank}`} className="flex scroll-mt-24 flex-col">
            <div className="flex gap-3 lg:gap-6">
              <div className="flex w-9 shrink-0 flex-col items-center lg:w-[52px]">
                <RankNode rank={rank} ranked={ranked} />
                {edge && (
                  <div
                    className={`mt-1.5 w-0 flex-1 border-r-2 lg:mt-2 ${EDGE_STYLES[edge.kind].line}`}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <ListNodeItem
                  item={item}
                  backlink={backlinks.get(rank)}
                  battleHref={battleHrefFor(items, edges, index)}
                  communityVoting={communityVoting}
                />
              </div>
            </div>
            {!isLast && edge && <EdgeConnector edge={edge} />}
            {!isLast && !edge && <div className="h-6" />}
          </li>
        );
      })}
    </ol>
  );
}
