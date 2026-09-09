import RankingList from "@/components/RankingList";
import { MovieListItem } from "@/lib/types";

interface RelatedListProps {
  title?: string;
  items: MovieListItem[];
}

export default function RelatedList({ title, items }: RelatedListProps) {
  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
      <div className="mt-4">
        <RankingList movies={items} />
      </div>
    </section>
  );
}
