import Link from "next/link";
import RankingList from "@/components/RankingList";
import { GenreDetail } from "@/lib/types";

export default function GenreView({ data }: { data: GenreDetail }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <div className="mt-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-ink">بهترین‌های {data.title}</h1>
        <span className="num text-xs text-muted">{data.movies.length} عنوان</span>
      </div>

      <div className="mt-6">
        <RankingList movies={data.movies} />
      </div>
    </main>
  );
}
