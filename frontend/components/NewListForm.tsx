"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { createList, addListItem, SearchResult } from "@/lib/api";
import AddListItem from "@/components/AddListItem";
import ListPreviewCard, { ListPreviewItem } from "@/components/ListPreviewCard";
import { entityTypeLabel } from "@/lib/constants";

export default function NewListForm() {
  const router = useRouter();
  const { getToken, user } = useAuth();
  const { requireAuth } = useAuthGate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [entityType, setEntityType] = useState("movie");
  const [isPublic, setIsPublic] = useState(true);
  const [pendingItems, setPendingItems] = useState<ListPreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSelectPending(result: SearchResult) {
    if (pendingItems.some((item) => item.id === result.id)) return;
    setPendingItems((prev) => [
      ...prev,
      {
        id: result.id,
        slug: result.slug,
        name: result.title,
        entity_type: result.type,
        posterUrl: result.image_url,
        score: null,
      },
    ]);
  }

  function handleRemovePending(id: string) {
    setPendingItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function doCreate() {
    const token = getToken();
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await createList(token, {
        title,
        description: description || undefined,
        entity_type: entityType || undefined,
        is_ranked: true,
        visibility: isPublic ? "public" : "private",
        tags: [],
      });

      for (const item of pendingItems) {
        try {
          await addListItem(token, result.slug, { entity_id: item.id });
        } catch {
          // list is already created -- keep going so one bad item doesn't
          // block the rest; the user can retry failed adds from the list page.
        }
      }

      router.push(`/lists/${result.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ساخت لیست");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requireAuth(doCreate);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-center text-2xl font-bold text-ink">ساخت لیست جدید</h1>
      <p className="mt-2 text-center text-sm text-muted">
        مثلاً «۱۰ بهترین فیلم اکشن» یا «۵ بهترین بازیگر تاریخ»
      </p>

      <div className="mt-10 flex flex-col gap-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-muted">عنوان لیست</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">توضیح (اختیاری)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-muted">دسته‌بندی</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-ink outline-none focus:border-gold/50"
            >
              <option value="movie">{entityTypeLabel("movie")}</option>
              <option value="tv_series">{entityTypeLabel("tv_series")}</option>
              <option value="person">{entityTypeLabel("person")}</option>
              <option value="">ترکیبی</option>
            </select>
          </div>

          <AddListItem
            entityType={entityType || null}
            onSelectPending={handleSelectPending}
            selectedIds={pendingItems.map((item) => item.id)}
          />

          {error && (
            <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold">
              {error}
            </p>
          )}

          <div className="mt-2 flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-gold px-4 py-2.5 font-bold text-bg transition hover:bg-gold/90 disabled:opacity-50"
            >
              {submitting ? "در حال ساخت..." : "ساخت لیست"}
            </button>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 accent-gold"
              />
              عمومی
            </label>
          </div>
        </form>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">پیش‌نمایش</h2>
          <ListPreviewCard
            title={title}
            description={description}
            pendingItems={pendingItems}
            ownerName={user?.username ?? null}
            onRemoveItem={handleRemovePending}
          />
        </div>
      </div>
    </main>
  );
}
