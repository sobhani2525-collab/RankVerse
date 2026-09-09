import Link from "next/link";
import EntityHero from "@/components/EntityHero";
import EntityDescription from "@/components/EntityDescription";
import MediaPlayer from "@/components/MediaPlayer";
import RelatedList from "@/components/RelatedList";
import { GenreDetail } from "@/lib/types";

export default function GenreView({ data }: { data: GenreDetail }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <EntityHero
        title={`بهترین‌های ${data.title}`}
        subtitle={`${data.movies.length} عنوان`}
        media={data.media}
      />
      <MediaPlayer media={data.media} />
      <EntityDescription text={data.description} />
      <RelatedList items={data.movies} />
    </main>
  );
}
