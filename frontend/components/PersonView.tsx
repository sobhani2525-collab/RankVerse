import Link from "next/link";
import EntityHero from "@/components/EntityHero";
import EntityDescription from "@/components/EntityDescription";
import MediaPlayer from "@/components/MediaPlayer";
import RelatedList from "@/components/RelatedList";
import { PersonDetail } from "@/lib/types";

export default function PersonView({ data }: { data: PersonDetail }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <EntityHero title={data.title} media={data.media} />
      <MediaPlayer media={data.media} />
      <EntityDescription text={data.biography} />

      <RelatedList title="کارگردانی‌ها" items={data.directed} />
      <RelatedList title="بازیگری‌ها" items={data.acted_in} />
    </main>
  );
}
