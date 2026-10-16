import type { WatchLink } from "@/lib/types";
import { watchLinkHref } from "@/lib/watch-links";

/**
 * "کجا ببینم": one button per Iranian streaming service that carries the title.
 * Each button goes through the API's counted redirect; nothing renders when
 * there are no links.
 */
export default function WatchLinks({ links }: { links: WatchLink[] }) {
  if (links.length === 0) return null;

  return (
    <section aria-label="کجا ببینم" className="mt-6">
      <p className="text-xs text-muted">کجا ببینم</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.id}>
            <a
              href={watchLinkHref(l)}
              target="_blank"
              rel={`noopener noreferrer nofollow${l.is_affiliate ? " sponsored" : ""}`}
              className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-4 py-2 text-sm text-ink transition hover:bg-gold/15"
            >
              <span className="font-bold">{l.provider_name}</span>
              <span className="text-xs text-muted">{l.access_label}</span>
              <span aria-hidden="true" className="text-gold">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
