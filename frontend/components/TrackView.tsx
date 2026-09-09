import Link from "next/link";
import EntityHero from "@/components/EntityHero";
import MediaPlayer from "@/components/MediaPlayer";
import RelatedList from "@/components/RelatedList";
import { TrackDetail } from "@/lib/types";

export default function TrackView({ data }: { data: TrackDetail }) {
  const subtitle = [data.artist?.title, data.album?.title].filter(Boolean).join(" • ");

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm text-muted hover:text-gold">
        بازگشت به فهرست
      </Link>

      <EntityHero title={data.title} subtitle={subtitle || null} media={data.media} />
      <MediaPlayer media={data.media} />

      <RelatedList
        title={data.artist ? `آهنگ‌های دیگر از ${data.artist.title}` : undefined}
        items={data.other_tracks}
      />
    </main>
  );
}
