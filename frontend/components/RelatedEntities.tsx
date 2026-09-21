"use client";

import { useState } from "react";
import { RelatedEntity } from "@/lib/api";
import { relatedEntityToEntityCard } from "@/lib/entity-card-adapters";
import { toFaDigits } from "@/lib/format-number";
import FavoriteEntityCard from "@/components/entities/favorite-entity-card";

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
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-5">
        {items.map((item) => {
          const isOpen = openReasonId === item.id;

          return (
            <div key={item.id} className="flex flex-col gap-1.5">
              <FavoriteEntityCard entity={relatedEntityToEntityCard(item)} />

              <div className="flex items-center justify-between gap-2">
                <span className="num text-[10px] text-muted">{toFaDigits(Math.round(item.weight * 100))}% مشابهت</span>
                {item.reason && (
                  <button
                    onClick={() => setOpenReasonId(isOpen ? null : item.id)}
                    className="shrink-0 text-[10px] text-gold hover:underline"
                  >
                    {isOpen ? "بستن" : "چرا این پیشنهاد؟"}
                  </button>
                )}
              </div>

              {isOpen && item.reason && (
                <p className="text-[11px] leading-snug text-muted">{item.reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}