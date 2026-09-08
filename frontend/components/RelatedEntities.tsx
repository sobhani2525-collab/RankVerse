"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { RelatedEntity } from "@/lib/api";

interface RelatedEntitiesProps {
  items: RelatedEntity[];
}

export default function RelatedEntities({ items }: RelatedEntitiesProps) {
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">اگر این را دوست داری...</h2>
        <span className="text-xs text-muted">بر اساس گراف دانش</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const posterUrl = item.poster_path
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : null;
          const isOpen = openReasonId === item.id;

          return (
            <div key={item.id} className="rounded-xl bg-surface2 p-3">
              <Link href={`/movies/${item.slug}`} className="group block">
                <div className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-lg bg-ink/5">
                  {posterUrl ? (
                    <Image
                      src={posterUrl}
                      alt={item.title}
                      fill
                      className="object-cover transition group-hover:opacity-90"
                      sizes="200px"
                    />
                  ) : (
                    <span className="text-xs text-muted">no poster</span>
                  )}
                </div>
                <b className="mt-2 block truncate text-sm text-ink">{item.title}</b>
                <span className="num text-xs text-muted">{Math.round(item.weight * 100)}% mashabeh</span>
              </Link>

              {item.reason && (
                <div className="mt-2">
                  <button
                    onClick={() => setOpenReasonId(isOpen ? null : item.id)}
                    className="text-[11px] text-gold hover:underline"
                  >
                    {isOpen ? "بستن" : "چرا این پیشنهاد؟"}
                  </button>
                  {isOpen && (
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      {item.reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}