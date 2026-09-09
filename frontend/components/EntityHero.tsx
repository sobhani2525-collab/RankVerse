import Image from "next/image";
import { MediaInfo } from "@/lib/types";

interface EntityHeroProps {
  title: string;
  subtitle?: string | null;
  media?: MediaInfo | null;
}

/**
 * Generic entity header: image + title + subtitle. The image only renders
 * when media.image_url is present, so this looks the same whether it's
 * backing a movie, a person, a genre, or (later) a song with cover art —
 * no entity_type branching.
 */
export default function EntityHero({ title, subtitle, media }: EntityHeroProps) {
  const imageUrl = media?.image_url ?? null;

  return (
    <div className="mt-6 flex flex-col gap-8 sm:flex-row">
      {imageUrl && (
        <div className="h-72 w-48 shrink-0 overflow-hidden rounded-xl bg-surface2 sm:mx-0 mx-auto">
          <Image
            src={imageUrl}
            alt={title}
            width={192}
            height={288}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="num mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
