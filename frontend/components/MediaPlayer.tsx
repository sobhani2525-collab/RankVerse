import { MediaInfo } from "@/lib/types";

interface MediaPlayerProps {
  media?: MediaInfo | null;
}

/**
 * Renders nothing until an entity actually has audio or video — e.g. a
 * future song entity's media.audio_preview_url. No entity_type check here;
 * whichever field is present decides what plays.
 */
export default function MediaPlayer({ media }: MediaPlayerProps) {
  if (!media) return null;

  if (media.audio_preview_url) {
    return (
      <audio controls className="mt-6 w-full" src={media.audio_preview_url}>
        مرورگر شما از پخش صدا پشتیبانی نمی‌کند.
      </audio>
    );
  }

  if (media.video_url) {
    return (
      <video
        controls
        className="mt-6 w-full overflow-hidden rounded-xl bg-surface2"
        src={media.video_url}
      />
    );
  }

  return null;
}
