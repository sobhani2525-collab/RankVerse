import Link from "next/link";
import { RelatedEntity } from "@/lib/api";

interface RelatedEntitiesProps {
  items: RelatedEntity[];
}

export default function RelatedEntities({ items }: RelatedEntitiesProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">✨ اگر این را دوست داری...</h2>
        <span className="text-xs text-muted">بر اساس گراف دانش</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/movie/${item.slug}`}
            className="rounded-xl bg-surface2 p-3 transition hover:ring-1 hover:ring-gold"
          >
            <div className="flex h-16 w-full items-center justify-center rounded-lg bg-ink/5 text-2xl">
              🎬
            </div>
            <b className="mt-2 block truncate text-sm text-ink">{item.title}</b>
            <span className="num text-xs text-muted">{Math.round(item.weight * 100)}% مشابه</span>
          </Link>
        ))}
      </div>
    </div>
  );
}