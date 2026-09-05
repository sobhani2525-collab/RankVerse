"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { removeListItem, reorderListItems } from "@/lib/api";
import { ListItem } from "@/lib/types";

export default function ListItemsManager({
  slug,
  isRanked,
  isOwner,
  initialItems,
}: {
  slug: string;
  isRanked: boolean;
  isOwner: boolean;
  initialItems: ListItem[];
}) {
  const { token } = useAuth();
  const [items, setItems] = useState(
    [...initialItems].sort((a, b) => a.position - b.position)
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function persistOrder(newItems: ListItem[]) {
    if (!token) return;
    setItems(newItems);
    try {
      await reorderListItems(token, slug, newItems.map((i) => i.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در تغییر ترتیب");
    }
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    persistOrder(next);
  }

  function moveDown(index: number) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    persistOrder(next);
  }

  async function handleRemove(itemId: string) {
    if (!token) return;
    if (!confirm("این آیتم از لیست حذف شود؟")) return;
    setBusyId(itemId);
    setError(null);
    try {
      await removeListItem(token, slug, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در حذف آیتم");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
        این لیست هنوز آیتمی ندارد.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
          {error}
        </p>
      )}

      {items.map((item, idx) => {
        const posterUrl = item.entity.poster_path
          ? `https://image.tmdb.org/t/p/w200${item.entity.poster_path}`
          : null;
        return (
          <div
            key={item.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface/60 px-4 py-3"
          >
            {isRanked && (
              <span className="num w-9 shrink-0 text-center text-lg text-muted">
                {String(idx + 1).padStart(2, "0")}
              </span>
            )}

            <div className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-surface2">
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={item.entity.title}
                  width={44}
                  height={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  —
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <Link
                href={
                  item.entity.entity_type === "movie"
                    ? `/movies/${item.entity.slug}`
                    : "#"
                }
                className="truncate font-medium text-ink hover:text-gold"
              >
                {item.entity.title}
              </Link>
              {item.note && (
                <p className="mt-0.5 truncate text-sm text-muted">{item.note}</p>
              )}
            </div>

            {isOwner && (
              <div className="flex shrink-0 items-center gap-1">
                {isRanked && (
                  <>
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="rounded-lg border border-border px-2 py-1.5 text-muted transition hover:border-gold/40 hover:text-gold disabled:opacity-30"
                      title="جابجایی به بالا"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === items.length - 1}
                      className="rounded-lg border border-border px-2 py-1.5 text-muted transition hover:border-gold/40 hover:text-gold disabled:opacity-30"
                      title="جابجایی به پایین"
                    >
                      ▼
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={busyId === item.id}
                  className="rounded-lg border border-border px-2 py-1.5 text-muted transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                  title="حذف از لیست"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}