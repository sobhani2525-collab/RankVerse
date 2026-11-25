import ListTicketCard from "@/components/lists/list-ticket-card";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import type { ListSummary } from "@/lib/types";

export default function ListTicketGrid({ lists }: { lists: ListSummary[] }) {
  return (
    <div className="grid min-h-[8rem] grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      {lists.map((list) => (
        <ListTicketCard key={list.id} list={listSummaryToTicketCard(list)} />
      ))}
    </div>
  );
}
