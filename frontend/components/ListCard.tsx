import Link from "next/link";
import { ListSummary } from "@/lib/types";

export default function ListCard({ list }: { list: ListSummary }) {
  return (
    <Link
      href={`/lists/${list.slug}`}
      className="group flex flex-col gap-2 rounded-xl border border-border bg-surface/60 px-5 py-4 transition hover:border-gold/40 hover:bg-surface2"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-ink group-hover:text-gold">{list.title}</h3>
        {list.entity_type && (
          <span className="num shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
            {list.entity_type}
          </span>
        )}
      </div>

      {list.description && (
        <p className="line-clamp-2 text-sm text-muted">{list.description}</p>
      )}

      <div className="mt-1 flex items-center gap-4 text-xs text-muted">
        {list.owner_username && (
          <span className="text-teal">@{list.owner_username}</span>
        )}
        <span className="num flex items-center gap-1">
          ♥ {list.like_count}
        </span>
        <span className="num flex items-center gap-1">
          💬 {list.comment_count}
        </span>
        <span className="num flex items-center gap-1">
          👁 {list.view_count}
        </span>
      </div>
    </Link>
  );
}