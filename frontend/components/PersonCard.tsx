"use client";
import Image from "next/image";
import Link from "next/link";
import { useFavorites } from "@/contexts/FavoritesContext";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import type { PersonListItem } from "@/lib/api";

/** Poster-card look for a person: 2:3 photo, name, credit-count pill. */
export default function PersonCard({ person }: { person: PersonListItem }) {
  const href = `/person/${person.slug}`;
  const photo = person.media.image_url;
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(person.id);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-border bg-surface-2">
        <Link href={href} className="absolute inset-0" aria-label={person.title_fa ?? person.title}>
          {photo ? (
            <Image src={photo} alt={person.title_fa ?? person.title} fill sizes="(max-width: 768px) 50vw, 220px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">بدون تصویر</div>
          )}
        </Link>

        <button
          type="button"
          aria-label={favorited ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
          aria-pressed={favorited}
          onClick={(e) => {
            e.preventDefault();
            toggleFavorite({ id: person.id, slug: person.slug, entity_type: "person" });
          }}
          className="absolute left-2 top-2 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-sm transition"
          style={{
            background: "rgba(10,13,20,0.72)",
            borderColor: favorited ? "#F07178" : "rgba(255,255,255,0.15)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={favorited ? "#F07178" : "none"}
            stroke={favorited ? "#F07178" : "#EDEFF5"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
      </div>

      <Link href={href} className="truncate text-sm font-bold text-ink transition hover:text-gold">
        {displayTitle(person)}
      </Link>

      <span className="w-fit rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
        <span className="num">{toFaDigits(person.works_count)}</span> اثر
      </span>
    </div>
  );
}
