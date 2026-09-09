import Link from "next/link";
import RankingList from "@/components/RankingList";
import { PersonDetail } from "@/lib/types";

export default function PersonView({ data }: { data: PersonDetail }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-ink">{data.title}</h1>

      {data.biography && (
        <p className="mt-4 text-sm leading-relaxed text-ink/90">{data.biography}</p>
      )}

      {data.directed.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-ink">کارگردانی‌ها</h2>
          <div className="mt-4">
            <RankingList movies={data.directed} />
          </div>
        </section>
      )}

      {data.acted_in.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-ink">بازیگری‌ها</h2>
          <div className="mt-4">
            <RankingList movies={data.acted_in} />
          </div>
        </section>
      )}
    </main>
  );
}
